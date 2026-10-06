import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { branches, goodsReceiptLines, goodsReceipts, stockItems, suppliers } from '@/db/schema';
import type { DbOrTx, Tx } from '@/db/types';
import { ensureColorCard } from '@/domain/catalog/colors';
import { createStockItem } from '@/domain/catalog/stock-items';
import { ownBranch, type Scope } from '@/domain/scope';
import { applyMovements } from '@/domain/stock/movements';
import { nextDocumentNumber } from '@/lib/counters';
import { DomainError, NotFoundError } from '@/lib/errors';
import { stockCardKey } from '@/lib/text';

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
  /**
   * Kumas rengi: parca bu renkte geldi. Stok o rengin kartina girer; kart
   * yoksa mal kabulle ayni islemde acilir.
   */
  colorCode?: string | null;
}

/**
 * Katalogda olmayan, mal kabulle birlikte acilacak stok karti. Kullanici
 * formda "stoklara eklensin mi" sorusuna evet demis olmali; kart burada,
 * mal kabulle ayni transaction'da aciliyor.
 */
export interface NewReceiptItemInput {
  name: string;
  sizeLabel?: string | null;
  categoryId?: string | null;
  quantity: number;
}

export interface CreateGoodsReceiptInput {
  supplierId?: string | null;
  waybillNo?: string | null;
  /** ISO tarih (YYYY-MM-DD). */
  receivedAt: string;
  notes?: string | null;
  lines: ReceiptLineInput[];
  newItems?: NewReceiptItemInput[];
}

export interface GoodsReceiptLineDetail {
  id: string;
  stockItemId: string;
  stockItemName: string;
  stockItemSku: string;
  sizeLabel: string | null;
  /** Renk kartinda renk kodu. */
  variantLabel: string | null;
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
  const branch = ownBranch(scope);

  return runInTransaction(db, async (tx) => {
    // Yeni kartlar once: satirlar onlarin kimligine ihtiyac duyuyor. Kayit
    // yarida kalirsa kartlar da acilmamis olur.
    const created = await openNewItems(tx, input.newItems ?? []);
    const colored = await resolveColors(tx, input.lines);
    const lines = mergeLines([...colored, ...created]);

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
      variantLabel: stockItems.variantLabel,
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

/**
 * Yeni kartlari acar ve mal kabul satirina cevirir.
 *
 * - Ayni ad ve olcu iki kez gelirse tek kart acilir, adetler toplanir.
 * - Ayni ad ve olcude bir kart zaten varsa yenisi acilmaz, o kullanilir.
 *   Stok kartlari silinmedigi icin bir mukerrer kart kalici bir hata olurdu.
 */
async function openNewItems(tx: Tx, items: NewReceiptItemInput[]): Promise<ReceiptLineInput[]> {
  if (items.length === 0) return [];

  const grouped = new Map<string, NewReceiptItemInput>();
  for (const item of items) {
    const name = item.name.trim();
    if (name === '') throw new DomainError('Yeni kartin adi bos olamaz.', 'INVALID_INPUT');
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new DomainError('Adet sifirdan buyuk tam sayi olmali.', 'INVALID_QUANTITY');
    }
    const key = stockCardKey(name, item.sizeLabel);
    const existing = grouped.get(key);
    if (existing) existing.quantity += item.quantity;
    else grouped.set(key, { ...item, name, sizeLabel: item.sizeLabel?.trim() || null });
  }

  // Renk kartlari ana kartla ayni ad ve olcude; "bu kart var mi" sorusu
  // ana karta bakmali, yoksa yeni urun bir rengin kartina yazilirdi.
  const catalog = await tx
    .select({ id: stockItems.id, name: stockItems.name, sizeLabel: stockItems.sizeLabel })
    .from(stockItems)
    .where(isNull(stockItems.parentStockItemId));
  const byKey = new Map(catalog.map((card) => [stockCardKey(card.name, card.sizeLabel), card.id]));

  const lines: ReceiptLineInput[] = [];
  for (const [key, item] of grouped) {
    let stockItemId = byKey.get(key);
    if (!stockItemId) {
      const card = await createStockItem(tx, {
        name: item.name,
        sizeLabel: item.sizeLabel,
        categoryId: item.categoryId ?? null,
      });
      stockItemId = card.id;
      byKey.set(key, stockItemId);
    }
    lines.push({ stockItemId, quantity: item.quantity });
  }
  return lines;
}

/** Rengi belirtilen satir o rengin kartina yazilir (kart yoksa acilir). */
async function resolveColors(tx: Tx, lines: ReceiptLineInput[]): Promise<ReceiptLineInput[]> {
  const result: ReceiptLineInput[] = [];
  for (const line of lines) {
    const code = line.colorCode?.trim();
    if (!code) {
      result.push(line);
      continue;
    }
    const card = await ensureColorCard(tx, line.stockItemId, code);
    result.push({ ...line, stockItemId: card.id, colorCode: null });
  }
  return result;
}

async function runInTransaction<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const maybeTx = db as Partial<Tx>;
  if (typeof maybeTx.rollback === 'function') return fn(db as Tx);
  return (db as { transaction: <R>(cb: (tx: Tx) => Promise<R>) => Promise<R> }).transaction(fn);
}
