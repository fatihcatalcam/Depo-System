import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { productComponents, products, stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { sizesMatch } from '@/domain/catalog/sizes';
import { nextDocumentNumber } from '@/lib/counters';
import { DomainError, NotFoundError } from '@/lib/errors';

export type Product = typeof products.$inferSelect;

export interface ComponentInput {
  stockItemId: string;
  quantity: number;
}

export interface ComponentDetail extends ComponentInput {
  id: string;
  stockItemName: string;
  stockItemSku: string;
  sizeLabel: string | null;
}

export interface ProductWithComponents extends Product {
  components: ComponentDetail[];
}

export interface CreateProductInput {
  name: string;
  categoryId?: string | null;
  defaultPriceKurus?: number | null;
  notes?: string | null;
  components: ComponentInput[];
}

export async function createProduct(db: DbOrTx, input: CreateProductInput): Promise<Product> {
  const name = input.name.trim();
  if (name === '') throw new DomainError('Urun adi bos olamaz.', 'INVALID_INPUT');
  validateComponents(input.components);

  const code = await nextDocumentNumber(db, 'product');

  const [product] = await db
    .insert(products)
    .values({
      code,
      name,
      categoryId: input.categoryId ?? null,
      defaultPriceKurus: input.defaultPriceKurus ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  await db.insert(productComponents).values(
    input.components.map((component) => ({
      productId: product.id,
      stockItemId: component.stockItemId,
      quantity: component.quantity,
    })),
  );

  return product;
}

export interface UpdateProductInput {
  name?: string;
  categoryId?: string | null;
  defaultPriceKurus?: number | null;
  notes?: string | null;
  isActive?: boolean;
  /** Verilirse recete tamamen bununla degistirilir. */
  components?: ComponentInput[];
}

export async function updateProduct(
  db: DbOrTx,
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  const [existing] = await db.select().from(products).where(eq(products.id, id));
  if (!existing) throw new NotFoundError('Urun');

  if (input.components) validateComponents(input.components);

  const name = input.name?.trim() ?? existing.name;
  if (name === '') throw new DomainError('Urun adi bos olamaz.', 'INVALID_INPUT');

  const [product] = await db
    .update(products)
    .set({
      name,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      defaultPriceKurus:
        input.defaultPriceKurus !== undefined
          ? input.defaultPriceKurus
          : existing.defaultPriceKurus,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: sql`now()`,
    })
    .where(eq(products.id, id))
    .returning();

  if (input.components) {
    // Recete degisikligi gecmis siparisleri etkilemez: onlar
    // order_line_components tablosunda dondurulmus halde durur.
    await db.delete(productComponents).where(eq(productComponents.productId, id));
    await db.insert(productComponents).values(
      input.components.map((component) => ({
        productId: id,
        stockItemId: component.stockItemId,
        quantity: component.quantity,
      })),
    );
  }

  return product;
}

export async function getProductWithComponents(
  db: DbOrTx,
  id: string,
): Promise<ProductWithComponents> {
  const [product] = await db.select().from(products).where(eq(products.id, id));
  if (!product) throw new NotFoundError('Urun');

  const rows = await db
    .select({
      id: productComponents.id,
      stockItemId: productComponents.stockItemId,
      quantity: productComponents.quantity,
      stockItemName: stockItems.name,
      stockItemSku: stockItems.sku,
      sizeLabel: stockItems.sizeLabel,
    })
    .from(productComponents)
    .innerJoin(stockItems, eq(stockItems.id, productComponents.stockItemId))
    .where(eq(productComponents.productId, id))
    .orderBy(asc(stockItems.name));

  return { ...product, components: rows };
}

export async function listProducts(db: DbOrTx, includeInactive = false): Promise<Product[]> {
  return db
    .select()
    .from(products)
    .where(includeInactive ? undefined : eq(products.isActive, true))
    .orderBy(asc(products.name));
}

export interface CounterpartCandidate {
  id: string;
  label: string;
}

export interface CounterpartSuggestion {
  sourceId: string;
  sourceLabel: string;
  /** Tek aday varsa otomatik secilir; birden fazlaysa kullanici secmeli. */
  selectedId: string | null;
  candidates: CounterpartCandidate[];
}

/**
 * Verilen parcalarin hedef boyuttaki karsiliklarini bulur.
 *
 * Eslesme ayni `name` uzerinden, boyut ise `sizesMatch` ile yapilir — cunku
 * gercek veride baslik "160 CM", yatak "160x200" yaziyor. Ayni model+boyutta
 * birden fazla renk varsa hepsi aday olarak doner ve secimi kullanici yapar;
 * yanlis kumasla urun olusturmaktansa sormak dogrusudur.
 */
export async function suggestSizeCounterparts(
  db: DbOrTx,
  stockItemIds: string[],
  targetSizeLabel: string,
): Promise<Map<string, CounterpartSuggestion>> {
  const result = new Map<string, CounterpartSuggestion>();
  if (stockItemIds.length === 0) return result;

  const sources = await db
    .select({
      id: stockItems.id,
      name: stockItems.name,
      sizeLabel: stockItems.sizeLabel,
      variantLabel: stockItems.variantLabel,
      sku: stockItems.sku,
    })
    .from(stockItems)
    .where(inArray(stockItems.id, stockItemIds));

  if (sources.length === 0) return result;

  const pool = await db
    .select({
      id: stockItems.id,
      name: stockItems.name,
      sizeLabel: stockItems.sizeLabel,
      variantLabel: stockItems.variantLabel,
      sku: stockItems.sku,
    })
    .from(stockItems)
    .where(
      and(
        inArray(
          stockItems.name,
          sources.map((source) => source.name),
        ),
        eq(stockItems.isActive, true),
      ),
    );

  for (const source of sources) {
    const matches = pool.filter(
      (item) =>
        item.name === source.name &&
        item.id !== source.id &&
        sizesMatch(item.sizeLabel, targetSizeLabel),
    );

    // Ayni kumas/renk kodu varsa onu tercih et: kopyalanan urun ayni seriden olmali.
    const sameVariant = matches.filter(
      (item) => (item.variantLabel ?? '') === (source.variantLabel ?? ''),
    );
    const shortlist = sameVariant.length > 0 ? sameVariant : matches;

    result.set(source.id, {
      sourceId: source.id,
      sourceLabel: describeItem(source),
      selectedId: shortlist.length === 1 ? shortlist[0].id : null,
      candidates: shortlist.map((item) => ({ id: item.id, label: describeItem(item) })),
    });
  }

  return result;
}

interface DescribableItem {
  name: string;
  sizeLabel: string | null;
  variantLabel: string | null;
  sku: string;
}

function describeItem(item: DescribableItem): string {
  const parts = [item.name];
  if (item.sizeLabel) parts.push(item.sizeLabel);
  if (item.variantLabel) parts.push(item.variantLabel);
  return `${parts.join(' · ')} (${item.sku})`;
}

export interface DuplicateForSizeInput {
  name: string;
  targetSizeLabel: string;
  /** Otomatik oneriyi ezmek icin: kaynak parca id -> hedef parca id. */
  replacements?: Record<string, string>;
  defaultPriceKurus?: number | null;
}

/**
 * "Yatak A 90x190"dan "Yatak A 100x200" uretir: bes parcayi yeniden yazmak
 * yerine her parcanin hedef boyuttaki karsiligi bulunur ve recete
 * miktarlariyla kopyalanir.
 */
export async function duplicateProductForSize(
  db: DbOrTx,
  sourceProductId: string,
  input: DuplicateForSizeInput,
): Promise<Product> {
  const source = await getProductWithComponents(db, sourceProductId);

  const suggestions = await suggestSizeCounterparts(
    db,
    source.components.map((component) => component.stockItemId),
    input.targetSizeLabel,
  );

  const manual = input.replacements ?? {};
  const missing: string[] = [];
  const ambiguous: string[] = [];
  const components: ComponentInput[] = [];

  for (const component of source.components) {
    const suggestion = suggestions.get(component.stockItemId);
    const target = manual[component.stockItemId] ?? suggestion?.selectedId ?? null;

    if (!target) {
      if (suggestion && suggestion.candidates.length > 1) ambiguous.push(component.stockItemName);
      else missing.push(component.stockItemName);
      continue;
    }
    components.push({ stockItemId: target, quantity: component.quantity });
  }

  if (missing.length > 0) {
    throw new DomainError(
      `${input.targetSizeLabel} boyutunda karsiligi bulunamayan parcalar: ${missing.join(', ')}. Once bu parcalarin hedef boyuttaki stok kartlarini olusturun.`,
      'MISSING_COUNTERPART',
    );
  }

  if (ambiguous.length > 0) {
    throw new DomainError(
      `Su parcalarin hedef boyutta birden fazla secenegi var: ${ambiguous.join(', ')}. Hangisinin kullanilacagini secin.`,
      'AMBIGUOUS_COUNTERPART',
    );
  }

  return createProduct(db, {
    name: input.name,
    categoryId: source.categoryId,
    defaultPriceKurus:
      input.defaultPriceKurus !== undefined ? input.defaultPriceKurus : source.defaultPriceKurus,
    notes: source.notes,
    components,
  });
}

function validateComponents(components: ComponentInput[]) {
  if (components.length === 0) {
    throw new DomainError('Urun en az bir parca icermeli.', 'EMPTY_RECIPE');
  }

  const seen = new Set<string>();
  for (const component of components) {
    if (component.quantity <= 0) {
      throw new DomainError('Recete miktari sifirdan buyuk olmali.', 'INVALID_QUANTITY');
    }
    if (seen.has(component.stockItemId)) {
      throw new DomainError(
        'Ayni parca recetede birden fazla kez yer alamaz.',
        'DUPLICATE_COMPONENT',
      );
    }
    seen.add(component.stockItemId);
  }
}
