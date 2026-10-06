import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { colorPalettes, orderLineColors, productComponents, stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { ensureColorCard } from '@/domain/catalog/colors';
import { DomainError } from '@/lib/errors';
import { normalizeColorCode } from '@/lib/color-codes';
import { foldText } from '@/lib/text';

/**
 * Siparis satirinda kumas rengi: "bu takimin bazasi BK-149, basligi BK-51".
 *
 * Secim satirla birlikte `order_line_colors`'a yaziliyor; taslakta bilesen
 * satiri yok. Onayda (`freezeComponents`) secilen parcanin yerine o rengin
 * karti yaziliyor, rezerv ve teslimat oradan yuruyor.
 */

export interface LineColorInput {
  /** Rengi secilen parca: takimin bazasi/basligi ya da tek parca satirinin kendisi. */
  baseStockItemId: string;
  code: string;
}

interface ColorLine {
  itemType: 'product' | 'stock_item' | 'custom';
  productId?: string | null;
  stockItemId?: string | null;
  colors?: LineColorInput[];
}

export interface ResolvedLineColors {
  colors: LineColorInput[];
  /** Aciklamaya eklenecek kisim: " (Baza BK-149, Başlık BK-51)" ya da " · BK-149". */
  suffix: string;
}

/**
 * Secimleri dogrular ve aciklama ekini hazirlar. Parca satirin icinde olmali
 * (takimin recetesinde ya da satirin kendisi), renk o parcanin kartelasinda
 * olmali. Kartelada kaldirilmis ama karti acilmis renk gecerli: eski siparis
 * duzenlenirken rengi kaybolmasin.
 */
export async function resolveLineColors(
  db: DbOrTx,
  lines: ColorLine[],
): Promise<ResolvedLineColors[]> {
  const chosen = lines.flatMap((line) => line.colors ?? []);
  if (chosen.length === 0) return lines.map(() => ({ colors: [], suffix: '' }));

  const productIds = [
    ...new Set(lines.flatMap((line) => (line.colors?.length && line.productId ? [line.productId] : []))),
  ];
  const baseIds = [...new Set(chosen.map((choice) => choice.baseStockItemId))];

  const [recipeRows, bases, cards] = await Promise.all([
    productIds.length
      ? db
          .select({ productId: productComponents.productId, stockItemId: productComponents.stockItemId })
          .from(productComponents)
          .where(inArray(productComponents.productId, productIds))
      : [],
    db
      .select({ id: stockItems.id, name: stockItems.name, codes: colorPalettes.codes })
      .from(stockItems)
      .leftJoin(colorPalettes, eq(colorPalettes.id, stockItems.colorPaletteId))
      .where(inArray(stockItems.id, baseIds)),
    db
      .select({ parentId: stockItems.parentStockItemId, code: stockItems.variantLabel })
      .from(stockItems)
      .where(and(inArray(stockItems.parentStockItemId, baseIds), isNotNull(stockItems.variantLabel))),
  ]);

  const baseById = new Map(bases.map((base) => [base.id, base]));
  const openedCards = new Set(cards.map((card) => `${card.parentId}|${card.code}`));

  return lines.map((line) => {
    const choices = line.colors ?? [];
    if (choices.length === 0) return { colors: [], suffix: '' };
    if (line.itemType === 'custom') {
      throw new DomainError('Serbest satirda renk secilemez.', 'INVALID_COLOR');
    }

    const parts =
      line.itemType === 'product'
        ? recipeRows.filter((row) => row.productId === line.productId).map((row) => row.stockItemId)
        : [line.stockItemId];

    const colors: LineColorInput[] = [];
    for (const choice of choices) {
      const code = normalizeColorCode(choice.code);
      const base = baseById.get(choice.baseStockItemId);
      if (!base || !parts.includes(base.id)) {
        throw new DomainError('Rengi secilen parca bu satirda yok.', 'INVALID_COLOR');
      }
      if (!(base.codes ?? []).includes(code) && !openedCards.has(`${base.id}|${code}`)) {
        throw new DomainError(`${base.name} icin "${code}" rengi yok.`, 'INVALID_COLOR');
      }
      if (colors.some((other) => other.baseStockItemId === base.id)) {
        throw new DomainError(`${base.name} icin iki renk secilmis.`, 'INVALID_COLOR');
      }
      colors.push({ baseStockItemId: base.id, code });
    }

    // Hep ayni sira: once baza, sonra baslik. Recete sirasina guvenilmez;
    // urun tanimlanirken parcalar hangi sirayla eklendiyse oyle gelir.
    const labelOf = (color: LineColorInput) =>
      colorPartLabel(baseById.get(color.baseStockItemId)?.name ?? '');
    colors.sort((a, b) => colorPartOrder(labelOf(a)) - colorPartOrder(labelOf(b)));
    const suffix =
      line.itemType === 'stock_item'
        ? ` · ${colors[0].code}`
        : ` (${colors.map((color) => `${labelOf(color)} ${color.code}`).join(', ')})`;
    return { colors, suffix };
  });
}

const PART_ORDER = ['Baza', 'Başlık'];

/**
 * Renkli parcalarin gosterim sirasi: baza, baslik, digerleri. Alfabe sirasi
 * tersini verirdi (Turkcede "s" "z"den once).
 */
export function colorPartOrder(label: string): number {
  const index = PART_ORDER.indexOf(label);
  return index === -1 ? PART_ORDER.length : index;
}

/** "LATEX MASTER BAZA" -> "Baza"; takim aciklamasinda model adi tekrar etmesin. */
export function colorPartLabel(name: string): string {
  const folded = foldText(name).trim();
  if (folded.endsWith(' baza')) return 'Baza';
  if (folded.endsWith(' baslik')) return 'Başlık';
  return name;
}

/** Satirlarin renk secimleri: "satir|parca" -> kod. */
export async function loadLineColors(
  db: DbOrTx,
  orderLineIds: string[],
): Promise<Map<string, string>> {
  if (orderLineIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(orderLineColors)
    .where(inArray(orderLineColors.orderLineId, orderLineIds));
  return new Map(rows.map((row) => [`${row.orderLineId}|${row.baseStockItemId}`, row.colorCode]));
}

/**
 * Bilesenin stok karti: rengi secildiyse o rengin karti (yoksa acilir),
 * secilmediyse parcanin kendisi.
 */
export async function componentCard(
  db: DbOrTx,
  colors: Map<string, string>,
  orderLineId: string,
  stockItemId: string,
): Promise<string> {
  const code = colors.get(`${orderLineId}|${stockItemId}`);
  if (!code) return stockItemId;
  return (await ensureColorCard(db, stockItemId, code)).id;
}
