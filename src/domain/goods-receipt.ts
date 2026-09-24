import { and, desc, eq, sql } from 'drizzle-orm';
import { branches, goodsReceiptLines, goodsReceipts, stockItems, suppliers } from '@/db/schema';
import type { DbOrTx, Tx } from '@/db/types';
import { ownBranch, type Scope } from '@/domain/scope';
import { applyMovements } from '@/domain/stock/movements';
import { nextDocumentNumber } from '@/lib/counters';
import { DomainError, NotFoundError } from '@/lib/errors';

/**
 * Mal kabul **depoya** baglidir, subeye degil.
 *
 * Mal kabul bir stok belgesidir: hangi parcadan kac adet girdigini yazar.
 * Ayni depodan satan subeler ayni girisi gorur — depoda "bu adet nereden
 * geldi" sorusu cevapsiz kalmasin diye. Baska deponun girisi gorunmez.
 *
 * Bu yuzden okuma fonksiyonlari `scopeFilter` degil `scope.stockBranchId`
 * kullanir: merkez bayragi baska bir deponun stoguna acilan kapi olmamali.
 */

export type GoodsReceipt = typeof goodsReceipts.$inferSelect;

export interface ReceiptLineInput {
  stockItemId: string;
  quantity: number;
  unitCostKurus?: number | null;
}

export interface CreateGoodsReceiptInput {
  supplierId?: string | null;
  waybillNo?: string | null;
  /** ISO tarih (YYYY-MM-DD). */
  receivedAt: string;
  notes?: string | null;
  lines: ReceiptLineInput[];
}

export interface GoodsReceiptLineDetail {
  id: string;
  stockItemId: string;
  stockItemName: string;
  stockItemSku: string;
  sizeLabel: string | null;
  quantity: number;
  unitCostKurus: number | null;
}

export interface GoodsReceiptDetail extends GoodsReceipt {
  supplierName: string | null;
  branchName: string;
  lines: GoodsReceiptLineDetail[];
}

/**
 * Mal kabul. Basligi, satirlari ve stok girislerini tek transaction icinde
 * yazar — yarim kalan bir kayit stogu bozmaz.
 */
export async function createGoodsReceipt(
  db: DbOrTx,
  scope: Scope,
  input: CreateGoodsReceiptInput,
): Promise<GoodsReceipt> {
  const lines = mergeLines(input.lines);
  const branch = ownBranch(scope);

  return runInTransaction(db, async (tx) => {
    const receiptNo = await nextDocumentNumber(tx, 'goodsReceipt', {
      branchCode: branch.code,
      year: Number(input.receivedAt.slice(0, 4)),
    });

    const [receipt] = await tx
      .insert(goodsReceipts)
      .values({
        branchId: branch.id,
        receiptNo,
        supplierId: input.supplierId ?? null,
        waybillNo: input.waybillNo?.trim() || null,
        receivedAt: input.receivedAt,
        notes: input.notes?.trim() || null,
      })
      .returning();

    await tx.insert(goodsReceiptLines).values(
      lines.map((line) => ({
        goodsReceiptId: receipt.id,
        stockItemId: line.stockItemId,
        quantity: line.quantity,
        unitCostKurus: line.unitCostKurus ?? null,
      })),
    );

    await applyMovements(
      tx,
      scope.stockBranchId,
      lines.map((line) => ({
        stockItemId: line.stockItemId,
        quantityChange: line.quantity,
        movementType: 'goods_receipt' as const,
        referenceType: 'goods_receipt',
        referenceId: receipt.id,
      })),
    );

    return receipt;
  });
}

export async function getGoodsReceipt(
  db: DbOrTx,
  scope: Scope,
  id: string,
): Promise<GoodsReceiptDetail> {
  const [row] = await db
    .select({
      receipt: goodsReceipts,
      supplierName: suppliers.name,
      branchName: branches.name,
    })
    .from(goodsReceipts)
    .leftJoin(suppliers, eq(suppliers.id, goodsReceipts.supplierId))
    .innerJoin(branches, eq(branches.id, goodsReceipts.branchId))
    .where(and(eq(goodsReceipts.id, id), eq(branches.stockBranchId, scope.stockBranchId)));

  if (!row) throw new NotFoundError('Mal kabul kaydi');

  const lines = await db
    .select({
      id: goodsReceiptLines.id,
      stockItemId: goodsReceiptLines.stockItemId,
      quantity: goodsReceiptLines.quantity,
      unitCostKurus: goodsReceiptLines.unitCostKurus,
      stockItemName: stockItems.name,
      stockItemSku: stockItems.sku,
      sizeLabel: stockItems.sizeLabel,
    })
    .from(goodsReceiptLines)
    .innerJoin(stockItems, eq(stockItems.id, goodsReceiptLines.stockItemId))
    .where(eq(goodsReceiptLines.goodsReceiptId, id));

  return {
    ...row.receipt,
    supplierName: row.supplierName,
    branchName: row.branchName,
    lines,
  };
}

export interface GoodsReceiptSummary extends GoodsReceipt {
  supplierName: string | null;
  branchName: string;
  lineCount: number;
  totalQuantity: number;
}

export async function listGoodsReceipts(
  db: DbOrTx,
  scope: Scope,
  limit = 100,
): Promise<GoodsReceiptSummary[]> {
  const rows = await db
    .select({
      receipt: goodsReceipts,
      supplierName: suppliers.name,
      branchName: branches.name,
      lineCount: sql<number>`count(${goodsReceiptLines.id})::int`,
      totalQuantity: sql<number>`coalesce(sum(${goodsReceiptLines.quantity}), 0)::int`,
    })
    .from(goodsReceipts)
    .leftJoin(suppliers, eq(suppliers.id, goodsReceipts.supplierId))
    .innerJoin(branches, eq(branches.id, goodsReceipts.branchId))
    .leftJoin(goodsReceiptLines, eq(goodsReceiptLines.goodsReceiptId, goodsReceipts.id))
    .where(eq(branches.stockBranchId, scope.stockBranchId))
    .groupBy(goodsReceipts.id, suppliers.name, branches.name)
    .orderBy(desc(goodsReceipts.receivedAt), desc(goodsReceipts.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row.receipt,
    supplierName: row.supplierName,
    branchName: row.branchName,
    lineCount: Number(row.lineCount),
    totalQuantity: Number(row.totalQuantity),
  }));
}

/**
 * Ayni parcanin birden fazla satirda gelmesi normaldir — gercek e-irsaliyeler
 * boyle geliyor (ornegin ayni yatak 1. ve 2. satirda birer adet). Bu yuzden
 * reddetmiyoruz, adetleri tek satirda topluyoruz.
 *
 * Birim maliyet satirlara gore degisebilir; toplanan satirda adet agirlikli
 * ortalama kullaniyoruz, boylece stok degeri raporu dogru kalir.
 */
function mergeLines(lines: ReceiptLineInput[]): ReceiptLineInput[] {
  if (lines.length === 0) {
    throw new DomainError('Mal kabul en az bir satir icermeli.', 'EMPTY_RECEIPT');
  }

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new DomainError('Adet sifirdan buyuk tam sayi olmali.', 'INVALID_QUANTITY');
    }
  }

  const merged = new Map<string, { quantity: number; costTotal: number; costQuantity: number }>();

  for (const line of lines) {
    const current = merged.get(line.stockItemId) ?? { quantity: 0, costTotal: 0, costQuantity: 0 };
    current.quantity += line.quantity;
    if (line.unitCostKurus != null) {
      current.costTotal += line.unitCostKurus * line.quantity;
      current.costQuantity += line.quantity;
    }
    merged.set(line.stockItemId, current);
  }

  return [...merged.entries()].map(([stockItemId, value]) => ({
    stockItemId,
    quantity: value.quantity,
    unitCostKurus:
      value.costQuantity > 0 ? Math.round(value.costTotal / value.costQuantity) : null,
  }));
}

async function runInTransaction<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const maybeTx = db as Partial<Tx>;
  if (typeof maybeTx.rollback === 'function') return fn(db as Tx);
  return (db as { transaction: <R>(cb: (tx: Tx) => Promise<R>) => Promise<R> }).transaction(fn);
}
