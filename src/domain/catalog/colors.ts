import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { colorPalettes, stockItems } from '@/db/schema';
import type { DbOrTx, Tx } from '@/db/types';
import { applyMovements, type MovementResult } from '@/domain/stock/movements';
import { DomainError, NotFoundError } from '@/lib/errors';
import { normalizeColorCode, sortColorCodes } from '@/lib/color-codes';
import { createStockItem, type StockItem } from './stock-items';

/**
 * Kumas renkleri.
 *
 * Renk renk yapilan bir kalemin (Latex Master bazasi gibi) her rengi ayri
 * bir stok karti: ana karta bagli, adi ve olcusu ayni, `variantLabel`'i renk
 * kodu. Rezerv, teslimat, sayim ve hareket gecmisi boylece hic degismeden
 * renk renk yuruyor.
 *
 * Renk karti ihtiyac olunca aciliyor: stokta o renge ilk + basilinca, o
 * renkte siparis onaylaninca ya da mal kabul edilince. Kartlar silinmedigi
 * icin kartelanin butun renkleri icin bastan kart acmak kalici bir kalabalik
 * olurdu.
 */

export type ColorPalette = typeof colorPalettes.$inferSelect;

/**
 * Ana kartin bu rengindeki karti dondurur, yoksa acar.
 *
 * Kart zaten varsa kartelaya bakilmaz: kod sonradan kartelada kaldirilmis
 * olabilir, eski siparis yine de kendi kartini bulmali. Yeni kart ise yalnizca
 * kartelada olan bir renk icin acilir.
 */
export async function ensureColorCard(
  db: DbOrTx,
  baseStockItemId: string,
  rawCode: string,
): Promise<StockItem> {
  const code = normalizeColorCode(rawCode);
  const [base] = await db.select().from(stockItems).where(eq(stockItems.id, baseStockItemId));
  if (!base) throw new NotFoundError('Stok karti');
  if (base.parentStockItemId) {
    throw new DomainError('Renk kartinin baska rengi olmaz; ana karti secin.', 'INVALID_INPUT');
  }

  const [existing] = await db
    .select()
    .from(stockItems)
    .where(and(eq(stockItems.parentStockItemId, base.id), eq(stockItems.variantLabel, code)));
  if (existing) return existing;

  const codes = base.colorPaletteId ? await paletteCodes(db, base.colorPaletteId) : [];
  if (!codes.includes(code)) {
    throw new DomainError(
      `${base.name}${base.sizeLabel ? ` ${base.sizeLabel}` : ''} icin "${code}" rengi yok.`,
      'INVALID_COLOR',
    );
  }

  return createStockItem(db, {
    name: base.name,
    sizeLabel: base.sizeLabel,
    variantLabel: code,
    categoryId: base.categoryId,
    unit: base.unit,
    purchasePriceKurus: base.purchasePriceKurus,
    parentStockItemId: base.id,
  });
}

/**
 * Bir rengin stogunu elle degistirir (stok listesindeki +/-). O renkte kart
 * yoksa once acilir; kart ve hareket ayni islemde, biri olmadan digeri
 * kalmaz.
 */
export async function adjustColorStock(
  db: DbOrTx,
  warehouseId: string,
  input: { baseStockItemId: string; code: string; delta: number; notes?: string },
): Promise<MovementResult> {
  return runInTransaction(db, async (tx) => {
    const card = await ensureColorCard(tx, input.baseStockItemId, input.code);
    const [result] = await applyMovements(tx, warehouseId, [
      {
        stockItemId: card.id,
        quantityChange: input.delta,
        movementType: 'manual',
        notes: input.notes,
      },
    ]);
    return result;
  });
}

/** Kartelasi olan kartlar icin kodlar: kart id -> kodlar. */
export async function colorCodesForItems(
  db: DbOrTx,
  stockItemIds: string[],
): Promise<Map<string, string[]>> {
  if (stockItemIds.length === 0) return new Map();
  const rows = await db
    .select({ id: stockItems.id, codes: colorPalettes.codes })
    .from(stockItems)
    .innerJoin(colorPalettes, eq(colorPalettes.id, stockItems.colorPaletteId))
    .where(inArray(stockItems.id, stockItemIds));
  return new Map(rows.map((row) => [row.id, row.codes]));
}

export async function listPalettes(db: DbOrTx): Promise<ColorPalette[]> {
  return db.select().from(colorPalettes).orderBy(asc(colorPalettes.name));
}

export async function createPalette(db: DbOrTx, name: string): Promise<ColorPalette> {
  const trimmed = name.trim();
  if (trimmed === '') throw new DomainError('Kartela adi bos olamaz.', 'INVALID_INPUT');
  const [clash] = await db
    .select({ id: colorPalettes.id })
    .from(colorPalettes)
    .where(sql`lower(${colorPalettes.name}) = lower(${trimmed})`);
  if (clash) throw new DomainError('Bu adda bir kartela zaten var.', 'DUPLICATE');
  const [row] = await db.insert(colorPalettes).values({ name: trimmed }).returning();
  return row;
}

export async function addPaletteCode(
  db: DbOrTx,
  paletteId: string,
  rawCode: string,
): Promise<ColorPalette> {
  const code = normalizeColorCode(rawCode);
  if (code === '') throw new DomainError('Renk kodu bos olamaz.', 'INVALID_INPUT');
  const codes = await paletteCodes(db, paletteId);
  if (codes.includes(code)) throw new DomainError(`${code} bu kartelada zaten var.`, 'DUPLICATE');
  return saveCodes(db, paletteId, sortColorCodes([...codes, code]));
}

/**
 * Kodu kartelada kaldirir. O renkte acilmis kartlar durur (kartlar
 * silinmiyor); stokta ve eski siparislerde gorunmeye devam eder, yalnizca
 * yeni secimlerde cikmaz.
 */
export async function removePaletteCode(
  db: DbOrTx,
  paletteId: string,
  rawCode: string,
): Promise<ColorPalette> {
  const code = normalizeColorCode(rawCode);
  const codes = await paletteCodes(db, paletteId);
  return saveCodes(db, paletteId, codes.filter((other) => other !== code));
}

async function paletteCodes(db: DbOrTx, paletteId: string): Promise<string[]> {
  const [row] = await db
    .select({ codes: colorPalettes.codes })
    .from(colorPalettes)
    .where(eq(colorPalettes.id, paletteId));
  if (!row) throw new NotFoundError('Kartela');
  return row.codes;
}

/** Zaten bir transaction icindeysek onu kullanir, degilsek yeni acar. */
async function runInTransaction<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const maybeTx = db as Partial<Tx>;
  if (typeof maybeTx.rollback === 'function') return fn(db as Tx);
  return (db as { transaction: <R>(cb: (tx: Tx) => Promise<R>) => Promise<R> }).transaction(fn);
}

async function saveCodes(db: DbOrTx, paletteId: string, codes: string[]): Promise<ColorPalette> {
  const [row] = await db
    .update(colorPalettes)
    .set({ codes, updatedAt: sql`now()` })
    .where(eq(colorPalettes.id, paletteId))
    .returning();
  return row;
}
