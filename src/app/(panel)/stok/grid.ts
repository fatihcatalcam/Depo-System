import { normalizeSearch } from '@/lib/catalog-search';
import { foldText } from '@/lib/text';

/**
 * Stok ekraninin Excel duzeni: her satir bir takim (yatak + baza + baslik),
 * parcalar yan yana.
 *
 * Takimlar isim tahminiyle degil, katalogdaki urun tanimlarindan kuruluyor:
 * hangi basligin hangi yatakla gittigini urun biliyor. Latex Master'da
 * baslik yataktan 10 cm genis (150x200 takimin basligi "160 CM"); isimden
 * eslestirseydik yanlis satira duserdi.
 */

export type PartKind = 'yatak' | 'baza' | 'baslik';

export const PART_KINDS: readonly PartKind[] = ['yatak', 'baza', 'baslik'];

export const PART_LABELS: Record<PartKind, string> = {
  yatak: 'Yatak',
  baza: 'Baza',
  baslik: 'Başlık',
};

export interface GridItem {
  id: string;
  name: string;
  sizeLabel: string | null;
  categoryId: string | null;
  categoryName: string | null;
  onHand: number;
  reserved: number;
  notes: string | null;
  /** SKU ve barkod: arama ve barkod okutma bunlarla da bulsun. */
  sku: string;
  barcode: string | null;
}

export interface GridProduct {
  id: string;
  name: string;
  components: { stockItemId: string; quantity: number }[];
}

export interface GridPart {
  item: GridItem;
  /** Takimda bu parcadan kac tane var; bugun hepsi 1. */
  perSet: number;
}

export interface GridSet {
  productId: string;
  model: string;
  size: string;
  parts: Record<PartKind, GridPart | null>;
  /** Uc parcadan da en az bir takimlik varsa kac takim cikar; yoksa null. */
  setCount: number | null;
}

export interface GridModel {
  model: string;
  sets: GridSet[];
}

export interface StockGrid {
  models: GridModel[];
  /** Hicbir takima girmeyen parcalar: dolap, kapak, komodin... */
  others: GridItem[];
}

/**
 * Renk esikleri (fiziksel adet): 0 ve alti kirmizi, 1 sari, 2 ve ustu yesil.
 * Dukkanin Excel'indeki kurallar.
 */
export type StockTone = 'empty' | 'low' | 'ok';

export function stockTone(quantity: number): StockTone {
  if (quantity <= 0) return 'empty';
  if (quantity === 1) return 'low';
  return 'ok';
}

/**
 * Parcanin turu once kategoriden, yoksa adin sonundan. Kategori elle
 * degistirilebildigi icin tek basina guvenilmez; ad da tek basina
 * guvenilmez ("... YATAK" diye biten bir set disi urun olabilir). Ikisi
 * birlikte gercek veride 567 parcanin hepsini dogru ayiriyor.
 */
export function partKindOf(item: Pick<GridItem, 'name' | 'categoryName'>): PartKind | null {
  const category = item.categoryName ? foldText(item.categoryName) : '';
  if (category === 'yatak' || category === 'baza' || category === 'baslik') return category;

  const name = foldText(item.name).trim();
  if (name.endsWith(' yatak')) return 'yatak';
  if (name.endsWith(' baza')) return 'baza';
  if (name.endsWith(' baslik')) return 'baslik';
  return null;
}

const SIZE_PATTERN = /(\d+)\s*[x*×]\s*(\d+)/i;

/** "COTTON MASTER 160x200 Set" -> "COTTON MASTER". */
export function modelOf(productName: string): string {
  return productName
    .replace(SIZE_PATTERN, ' ')
    .replace(/\bset\b/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Olculer sayisal siraya: 90x190, 90x200, 100x200, 140x190 ... Metin
 * sirasinda "100x200" "90x190"dan once gelirdi.
 */
export function compareSizes(a: string, b: string): number {
  const [aw, al] = sizeNumbers(a);
  const [bw, bl] = sizeNumbers(b);
  return aw - bw || al - bl || a.localeCompare(b, 'tr');
}

function sizeNumbers(size: string): [number, number] {
  const match = size.match(SIZE_PATTERN);
  if (match) return [Number(match[1]), Number(match[2])];
  const single = size.match(/\d+/);
  return single ? [Number(single[0]), 0] : [Number.MAX_SAFE_INTEGER, 0];
}

/** Uc parcanin da olmasi ve her birinden en az bir takimlik bulunmasi gerekiyor. */
export function setCountOf(parts: Record<PartKind, GridPart | null>): number | null {
  let count = Number.POSITIVE_INFINITY;
  for (const kind of PART_KINDS) {
    const part = parts[kind];
    if (!part) return null;
    count = Math.min(count, Math.floor(part.item.onHand / part.perSet));
  }
  return count >= 1 ? count : null;
}

export function buildStockGrid(items: GridItem[], products: GridProduct[]): StockGrid {
  const byId = new Map(items.map((item) => [item.id, item]));
  const used = new Set<string>();
  const models = new Map<string, GridSet[]>();

  for (const product of products) {
    const parts: Record<PartKind, GridPart | null> = { yatak: null, baza: null, baslik: null };
    let valid = product.components.length > 0;

    for (const component of product.components) {
      const item = byId.get(component.stockItemId);
      const kind = item ? partKindOf(item) : null;
      // Tanimi yatak/baza/baslik uclusune uymayan urun Excel satirina
      // sigmaz; parcalari "diger" listesinde gorunmeye devam eder.
      if (!item || !kind || parts[kind]) {
        valid = false;
        break;
      }
      parts[kind] = { item, perSet: component.quantity };
    }
    if (!valid) continue;

    const size =
      parts.yatak?.item.sizeLabel ??
      parts.baza?.item.sizeLabel ??
      product.name.match(SIZE_PATTERN)?.[0] ??
      '';
    const model = modelOf(product.name) || product.name;

    for (const kind of PART_KINDS) {
      const part = parts[kind];
      if (part) used.add(part.item.id);
    }

    const list = models.get(model) ?? [];
    list.push({ productId: product.id, model, size, parts, setCount: setCountOf(parts) });
    models.set(model, list);
  }

  return {
    models: [...models.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'tr'))
      .map(([model, sets]) => ({
        model,
        sets: sets.sort((a, b) => compareSizes(a.size, b.size)),
      })),
    others: items
      .filter((item) => !used.has(item.id))
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, 'tr') ||
          compareSizes(a.sizeLabel ?? '', b.sizeLabel ?? ''),
      ),
  };
}

/** Takimin parcalarinin hepsi; bos yerler atlanir. */
export function partsOf(set: GridSet): GridPart[] {
  return PART_KINDS.map((kind) => set.parts[kind]).filter(
    (part): part is GridPart => part !== null,
  );
}

export interface GridFilter {
  query?: string;
  categoryId?: string | null;
}

function itemHaystack(item: GridItem): string {
  return [item.name, item.sizeLabel, item.sku, item.barcode].filter(Boolean).join(' ');
}

/**
 * Arama ve kategori. Arama siparis formundakiyle ayni kurallarla: butun
 * kelimeler gecmeli, Turkce harf farki yok, "160*200" = "160x200". Takim,
 * model adiyla, olcusuyle ya da parcalarinin herhangi biriyle bulunur
 * (barkod okutunca o parcanin satiri gelir).
 */
export function filterStockGrid(grid: StockGrid, filter: GridFilter): StockGrid {
  const tokens = normalizeSearch(filter.query ?? '').split(' ').filter(Boolean);
  const matches = (text: string) => {
    if (tokens.length === 0) return true;
    const haystack = normalizeSearch(text);
    return tokens.every((token) => haystack.includes(token));
  };
  const inCategory = (item: GridItem) => !filter.categoryId || item.categoryId === filter.categoryId;

  return {
    models: grid.models
      .map((model) => ({
        ...model,
        sets: model.sets.filter((set) => {
          const parts = partsOf(set);
          const text = [model.model, set.size, ...parts.map((part) => itemHaystack(part.item))].join(
            ' ',
          );
          return matches(text) && parts.some((part) => inCategory(part.item));
        }),
      }))
      .filter((model) => model.sets.length > 0),
    others: grid.others.filter((item) => matches(itemHaystack(item)) && inCategory(item)),
  };
}
