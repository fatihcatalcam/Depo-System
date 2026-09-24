import { and, asc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { getOnHandQuantities, getReservedQuantities } from '@/domain/stock/availability';
import { nextDocumentNumber } from '@/lib/counters';
import { DomainError, NotFoundError } from '@/lib/errors';

export type StockItem = typeof stockItems.$inferSelect;

export interface CreateStockItemInput {
  name: string;
  sizeLabel?: string | null;
  variantLabel?: string | null;
  categoryId?: string | null;
  barcode?: string | null;
  unit?: string;
  minStockLevel?: number;
  purchasePriceKurus?: number | null;
  notes?: string | null;
}

export async function createStockItem(
  db: DbOrTx,
  input: CreateStockItemInput,
): Promise<StockItem> {
  const name = input.name.trim();
  if (name === '') throw new DomainError('Stok karti adi bos olamaz.', 'INVALID_INPUT');

  const sku = await nextDocumentNumber(db, 'stockItem');
  // Barkod verilmezse SKU'dan turetilir: "SK-00001" -> "SK00001". Tireyi
  // atiyoruz, Code128 etiketlerinde okuma hatasi riskini azaltiyor.
  const barcode = input.barcode?.trim() || sku.replace('-', '');

  await assertBarcodeAvailable(db, barcode, null);

  const [row] = await db
    .insert(stockItems)
    .values({
      sku,
      name,
      sizeLabel: input.sizeLabel?.trim() || null,
      variantLabel: input.variantLabel?.trim() || null,
      categoryId: input.categoryId ?? null,
      barcode,
      unit: input.unit?.trim() || 'adet',
      minStockLevel: input.minStockLevel ?? 0,
      purchasePriceKurus: input.purchasePriceKurus ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return row;
}

export interface UpdateStockItemInput {
  name?: string;
  sizeLabel?: string | null;
  variantLabel?: string | null;
  categoryId?: string | null;
  barcode?: string | null;
  unit?: string;
  minStockLevel?: number;
  purchasePriceKurus?: number | null;
  notes?: string | null;
  isActive?: boolean;
}

export async function updateStockItem(
  db: DbOrTx,
  id: string,
  input: UpdateStockItemInput,
): Promise<StockItem> {
  const [existing] = await db.select().from(stockItems).where(eq(stockItems.id, id));
  if (!existing) throw new NotFoundError('Stok karti');

  if (input.barcode) {
    await assertBarcodeAvailable(db, input.barcode.trim(), id);
  }

  const name = input.name?.trim() ?? existing.name;
  if (name === '') throw new DomainError('Stok karti adi bos olamaz.', 'INVALID_INPUT');

  // Adet bilincli olarak burada yok: stok yalnizca applyMovements ile degisir
  // ve subeye ozeldir, kartin uzerinde durmaz.
  const [row] = await db
    .update(stockItems)
    .set({
      name,
      sizeLabel:
        input.sizeLabel !== undefined ? input.sizeLabel?.trim() || null : existing.sizeLabel,
      variantLabel:
        input.variantLabel !== undefined
          ? input.variantLabel?.trim() || null
          : existing.variantLabel,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      barcode: input.barcode !== undefined ? input.barcode?.trim() || null : existing.barcode,
      unit: input.unit?.trim() || existing.unit,
      minStockLevel: input.minStockLevel ?? existing.minStockLevel,
      purchasePriceKurus:
        input.purchasePriceKurus !== undefined
          ? input.purchasePriceKurus
          : existing.purchasePriceKurus,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: sql`now()`,
    })
    .where(eq(stockItems.id, id))
    .returning();

  return row;
}

export interface StockItemFilters {
  query?: string;
  categoryId?: string | null;
  includeInactive?: boolean;
  limit?: number;
}

export async function searchStockItems(
  db: DbOrTx,
  filters: StockItemFilters = {},
): Promise<StockItem[]> {
  const conditions: SQL[] = [];

  if (!filters.includeInactive) conditions.push(eq(stockItems.isActive, true));
  if (filters.categoryId) conditions.push(eq(stockItems.categoryId, filters.categoryId));

  const query = filters.query?.trim();
  if (query) {
    const match = or(
      ilike(stockItems.name, `%${query}%`),
      ilike(stockItems.variantLabel, `%${query}%`),
      ilike(stockItems.sku, query),
      ilike(stockItems.barcode, query),
    );
    if (match) conditions.push(match);
  }

  return db
    .select()
    .from(stockItems)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(stockItems.name), asc(stockItems.sizeLabel))
    .limit(filters.limit ?? 200);
}

export interface StockItemWithAvailability extends StockItem {
  onHand: number;
  reserved: number;
  available: number;
  /** Serbest stok kritik seviyenin altina dustu — ekranda kirmizi gosterilir. */
  isBelowMinimum: boolean;
}

/**
 * Kartlar ortak, adetler depoya ozel: liste her zaman tek bir depoyu gosterir.
 * `warehouseId` zorunlu, cunku "hangi depo" sorusunun varsayilan bir cevabi
 * yok.
 */
export async function listStockItemsWithAvailability(
  db: DbOrTx,
  warehouseId: string,
  filters: StockItemFilters = {},
): Promise<StockItemWithAvailability[]> {
  const items = await searchStockItems(db, filters);
  if (items.length === 0) return [];

  const ids = items.map((item) => item.id);
  const [onHandMap, reservedMap] = await Promise.all([
    getOnHandQuantities(db, warehouseId, ids),
    getReservedQuantities(db, warehouseId, ids),
  ]);

  return items.map((item) => {
    const onHand = onHandMap.get(item.id) ?? 0;
    const reserved = reservedMap.get(item.id) ?? 0;
    const available = onHand - reserved;
    return {
      ...item,
      onHand,
      reserved,
      available,
      isBelowMinimum: available < item.minStockLevel,
    };
  });
}

async function assertBarcodeAvailable(db: DbOrTx, barcode: string, excludeId: string | null) {
  const rows = await db
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(eq(stockItems.barcode, barcode));

  if (rows.some((row) => row.id !== excludeId)) {
    throw new DomainError('Bu barkod baska bir stok kartinda kullaniliyor.', 'DUPLICATE_BARCODE');
  }
}
