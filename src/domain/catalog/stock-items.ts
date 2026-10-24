import { and, asc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
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
  /** Renk karti acilirken ana kart; yalnizca `ensureColorCard` verir. */
  parentStockItemId?: string | null;
  /** Kumas kartelasi; renk karti icin verilmez. */
  colorPaletteId?: string | null;
}

export async function createStockItem(
  db: DbOrTx,
  input: CreateStockItemInput,
): Promise<StockItem> {
  const name = input.name.trim();
  if (name === '') throw new DomainError('Stok kartı adı boş olamaz.', 'INVALID_INPUT');

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
      parentStockItemId: input.parentStockItemId ?? null,
      colorPaletteId: input.colorPaletteId ?? null,
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
  /** Kumas kartelasi; bos = renksiz kalem. Renk kartinda verilemez. */
  colorPaletteId?: string | null;
}

export async function updateStockItem(
  db: DbOrTx,
  id: string,
  input: UpdateStockItemInput,
): Promise<StockItem> {
  const [existing] = await db.select().from(stockItems).where(eq(stockItems.id, id));
  if (!existing) throw new NotFoundError('Stok kartı');

  if (input.barcode) {
    await assertBarcodeAvailable(db, input.barcode.trim(), id);
  }

  const name = input.name?.trim() ?? existing.name;
  if (name === '') throw new DomainError('Stok kartı adı boş olamaz.', 'INVALID_INPUT');
  if (input.colorPaletteId && existing.parentStockItemId) {
    throw new DomainError('Renk kartının kendi kartelası olmaz.', 'INVALID_INPUT');
  }

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
      colorPaletteId:
        input.colorPaletteId !== undefined ? input.colorPaletteId : existing.colorPaletteId,
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
  /**
   * Renk kartlarini disarida birak. Parca secilen yerlerde (siparis, mal
   * kabul, recete) renk ayrica seciliyor; ayni parca bir de her rengiyle
   * listede cikmasin.
   */
  baseOnly?: boolean;
  limit?: number;
}

export async function searchStockItems(
  db: DbOrTx,
  filters: StockItemFilters = {},
): Promise<StockItem[]> {
  const conditions: SQL[] = [];

  if (!filters.includeInactive) conditions.push(eq(stockItems.isActive, true));
  if (filters.categoryId) conditions.push(eq(stockItems.categoryId, filters.categoryId));
  if (filters.baseOnly) conditions.push(isNull(stockItems.parentStockItemId));

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

/** Takima ozel baslik olcusu: "140 CM (140x200)" -> "140x200". */
export function twinSetSize(sizeLabel: string | null): string | null {
  return sizeLabel?.match(/\((\d+\s*x\s*\d+)\)/i)?.[1] ?? null;
}

export interface TwinCard {
  id: string;
  /** "140x190": bu basligin ait oldugu takimin olcusu. */
  setSize: string;
  /** Formdaki satir adi: "BOHEMELA BASLIK · 140 CM (140x190) (SK-00423)". */
  label: string;
}

/**
 * Takima ozel basligin ikizleri: ayni ad, ayni genislik, parantezde farkli
 * takim olcusu ("BOHEMELA BASLIK 140 CM (140x190)" / "(140x200)"). Irsaliye
 * ayrimi yazmadigi icin mal kabulde hangisi oldugu secilir.
 *
 * Kart id -> ikizlerin hepsi (kendisi dahil), takim olcusune gore sirali.
 * Ikizi olmayan kart haritada yok.
 */
export async function findTwinCards(
  db: DbOrTx,
  stockItemIds: string[],
): Promise<Map<string, TwinCard[]>> {
  const result = new Map<string, TwinCard[]>();
  if (stockItemIds.length === 0) return result;
  const sources = await db
    .select({ id: stockItems.id, name: stockItems.name, sizeLabel: stockItems.sizeLabel })
    .from(stockItems)
    .where(inArray(stockItems.id, stockItemIds));
  const named = sources.filter((source) => twinSetSize(source.sizeLabel));
  if (named.length === 0) return result;

  const pool = await db
    .select({
      id: stockItems.id,
      name: stockItems.name,
      sizeLabel: stockItems.sizeLabel,
      sku: stockItems.sku,
    })
    .from(stockItems)
    .where(
      and(
        inArray(
          stockItems.name,
          named.map((source) => source.name),
        ),
        isNull(stockItems.parentStockItemId),
        eq(stockItems.isActive, true),
      ),
    );

  const prefix = (label: string | null) => (label ?? '').replace(/\s*\(.*\)\s*$/, '').trim();
  for (const source of named) {
    const twins = pool
      .filter(
        (item) =>
          item.name === source.name &&
          prefix(item.sizeLabel) === prefix(source.sizeLabel) &&
          twinSetSize(item.sizeLabel),
      )
      .map((item) => ({
        id: item.id,
        setSize: twinSetSize(item.sizeLabel) as string,
        label: `${item.name} · ${item.sizeLabel} (${item.sku})`,
      }))
      .sort((a, b) => a.setSize.localeCompare(b.setSize, 'tr', { numeric: true }));
    if (twins.length > 1) result.set(source.id, twins);
  }
  return result;
}

async function assertBarcodeAvailable(db: DbOrTx, barcode: string, excludeId: string | null) {
  const rows = await db
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(eq(stockItems.barcode, barcode));

  if (rows.some((row) => row.id !== excludeId)) {
    throw new DomainError('Bu barkod başka bir stok kartında kullanılıyor.', 'DUPLICATE_BARCODE');
  }
}
