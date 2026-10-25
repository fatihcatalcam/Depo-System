import { asc, eq, inArray } from 'drizzle-orm';
import { orderLineComponents, orderLines, payments, stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { colorPartLabel, colorPartOrder } from '@/domain/orders/line-colors';
import { listOrders, type OrderStatus, type OrderSummary } from '@/domain/orders/orders';
import type { Scope } from '@/domain/scope';
import type { PaymentMethod } from '@/lib/payment-methods';
import { productMatcher } from '@/lib/product-search';

/**
 * Siparis ozeti: dukkanin Excel'deki siparis listesinin karsiligi. Tek
 * satirda kim, ne, ne zaman, nereye ve ne kadar alindi.
 */

export type SummaryView = 'bekleyen' | 'teslim';

/** Excel'de ayri sayfalar: "Siparisler" ve "Teslim Edilenler". */
const VIEW_STATUSES: Record<SummaryView, OrderStatus[]> = {
  bekleyen: ['draft', 'confirmed', 'partially_delivered'],
  teslim: ['delivered'],
};

export interface PaymentBreakdown {
  method: PaymentMethod;
  installments: number | null;
  amountKurus: number;
}

/**
 * Siparisin cinsindeki bir urun. Teslim edilmeyen mavi, edilen kirmizi
 * yazilir. Takimin parcalari farkli zamanlarda gittiyse `parts` dolu: urun
 * adi duz, parcalar kendi renginde ("LATEX MASTER Set: Yatak, Baza, Baslik").
 */
export interface SummaryItem {
  text: string;
  delivered: boolean;
  parts?: { label: string; delivered: boolean }[];
}

export interface OrderSummaryRow extends OrderSummary {
  /** "2 Ad. 90x190 Fresh Cell Yatak", "100x200 Dozy Yatak"... teslim durumuyla. */
  items: SummaryItem[];
  /** Tekrarsiz: siparisin ve musterinin telefonlari, bu sirayla. */
  phones: string[];
  /** Yontem ve taksit bazinda toplanmis tahsilat. */
  paymentBreakdown: PaymentBreakdown[];
}

export interface SummaryFilters {
  view: SummaryView;
  query?: string;
  /**
   * Siparis tarihi (YYYY-MM-DD). Verilince sekme yok sayilir: o gun alinan
   * siparislerin hepsi, teslim edilmis olsun olmasin. Iptaller yine yok.
   */
  date?: string;
  /** Merkez icin tek sube; bos = kapsamdaki butun subeler. */
  branchId?: string;
}

const DAY_STATUSES: OrderStatus[] = ['draft', 'confirmed', 'partially_delivered', 'delivered'];

/** Excel sayfasi da bu kadar satirla aciliyor; teslim edilenler zamanla birikir. */
const SUMMARY_LIMIT = 1000;

export async function listOrderSummaries(
  db: DbOrTx,
  scope: Scope,
  filters: SummaryFilters,
): Promise<OrderSummaryRow[]> {
  const base = {
    statuses: filters.date ? DAY_STATUSES : VIEW_STATUSES[filters.view],
    orderDate: filters.date,
    branchId: filters.branchId,
    limit: SUMMARY_LIMIT,
  };
  // Arama varsa liste aramasiz geliyor: urun eslesmesi satirlara bakarak
  // burada yapiliyor, musteri/telefon/adres eslesmesi listOrders'ta.
  const query = filters.query?.trim();
  const all = await listOrders(db, scope, base);
  if (all.length === 0) return [];

  // Satirlar ve odemeler iki sorguda, siparis basina ayri sorgu degil.
  const ids = all.map((order) => order.id);
  const [lineRows, componentRows, paymentRows] = await Promise.all([
    db
      .select({
        id: orderLines.id,
        orderId: orderLines.orderId,
        description: orderLines.description,
        quantity: orderLines.quantity,
        isGift: orderLines.isGift,
      })
      .from(orderLines)
      .where(inArray(orderLines.orderId, ids))
      .orderBy(asc(orderLines.orderId), asc(orderLines.lineNo)),
    db
      .select({
        orderLineId: orderLineComponents.orderLineId,
        name: stockItems.name,
        sizeLabel: stockItems.sizeLabel,
        quantityPerUnit: orderLineComponents.quantityPerUnit,
        totalQuantity: orderLineComponents.totalQuantity,
        deliveredQuantity: orderLineComponents.deliveredQuantity,
      })
      .from(orderLineComponents)
      .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
      // leftJoin: serbest satirin stok karti yok.
      .leftJoin(stockItems, eq(stockItems.id, orderLineComponents.stockItemId))
      .where(inArray(orderLines.orderId, ids)),
    db
      .select({
        orderId: payments.orderId,
        method: payments.method,
        installments: payments.installments,
        amountKurus: payments.amountKurus,
      })
      .from(payments)
      .where(inArray(payments.orderId, ids)),
  ]);

  const componentsByLine = new Map<string, LineComponent[]>();
  for (const row of componentRows) {
    const list = componentsByLine.get(row.orderLineId) ?? [];
    list.push({
      name: row.name,
      quantityPerUnit: row.quantityPerUnit,
      totalQuantity: row.totalQuantity,
      deliveredQuantity: row.deliveredQuantity,
    });
    componentsByLine.set(row.orderLineId, list);
  }
  const list = query ? await searchOrders(db, scope, base, query, all, lineRows, componentRows) : all;
  const delivered = new Set(list.filter((order) => order.status === 'delivered').map((o) => o.id));

  const items = new Map<string, SummaryItem[]>();
  const listed = new Set(list.map((order) => order.id));
  for (const line of lineRows) {
    if (!listed.has(line.orderId)) continue;
    // Teslim edilmis sipariste her sey teslim edilmistir; bilesen bakmaya gerek yok.
    const lineItems = delivered.has(line.orderId)
      ? [{ text: lineText(line, line.quantity), delivered: true }]
      : summaryItems(line, componentsByLine.get(line.id) ?? []);
    items.set(line.orderId, [...(items.get(line.orderId) ?? []), ...lineItems]);
  }

  const breakdowns = new Map<string, PaymentBreakdown[]>();
  for (const payment of paymentRows) {
    const list = breakdowns.get(payment.orderId) ?? [];
    const same = list.find(
      (entry) => entry.method === payment.method && entry.installments === payment.installments,
    );
    if (same) same.amountKurus += Number(payment.amountKurus);
    else
      list.push({
        method: payment.method,
        installments: payment.installments,
        amountKurus: Number(payment.amountKurus),
      });
    breakdowns.set(payment.orderId, list);
  }

  const rows = list.map((order) => ({
    ...order,
    items: items.get(order.id) ?? [],
    phones: uniquePhones([
      order.deliveryPhone,
      order.deliveryPhone2,
      order.customerPhone,
      order.customerPhone2,
    ]),
    paymentBreakdown: breakdowns.get(order.id) ?? [],
  }));

  // Bekleyenler Excel'deki gibi eskiden yeniye: en uzun bekleyen ustte.
  // Teslim edilenlerde en yenisi ustte. Tek gunde girildigi sirayla.
  return filters.date || filters.view === 'bekleyen' ? rows.reverse() : rows;
}

/**
 * Aramaya uyan siparisler, listedeki sirayla: musteri, telefon, siparis no
 * ya da adresi uyanlar (veritabaninda) ve satirlarindan birinde aranan urun
 * gecenler (productMatcher, yazim hatasina dayanikli).
 */
async function searchOrders(
  db: DbOrTx,
  scope: Scope,
  base: Parameters<typeof listOrders>[2],
  query: string,
  all: OrderSummary[],
  lineRows: { id: string; orderId: string; description: string }[],
  componentRows: { orderLineId: string; name: string | null; sizeLabel: string | null }[],
): Promise<OrderSummary[]> {
  const byText = new Set((await listOrders(db, scope, { ...base, query })).map((order) => order.id));

  const matcher = productMatcher(query);
  const byProduct = new Set<string>();
  if (matcher) {
    const partTexts = new Map<string, string[]>();
    for (const row of componentRows) {
      const texts = partTexts.get(row.orderLineId) ?? [];
      texts.push(...[row.name, row.sizeLabel].filter((text): text is string => Boolean(text)));
      partTexts.set(row.orderLineId, texts);
    }
    for (const line of lineRows) {
      if (matcher([line.description, ...(partTexts.get(line.id) ?? [])])) byProduct.add(line.orderId);
    }
  }

  return all.filter((order) => byText.has(order.id) || byProduct.has(order.id));
}

export interface LineComponent {
  /** Serbest satirda bos. */
  name: string | null;
  quantityPerUnit: number;
  totalQuantity: number;
  deliveredQuantity: number;
}

interface SummaryLine {
  description: string;
  quantity: number;
  isGift: boolean;
}

function lineText(line: SummaryLine, quantity: number): string {
  return `${quantity > 1 ? `${quantity} Ad. ` : ''}${line.description}${line.isGift ? ' (hediye)' : ''}`;
}

/**
 * Satirin teslim durumu.
 *
 * Taslakta bilesen yok (onayda donduruluyor): teslim edilmemis. Takimin her
 * parcasindan ayni oranda gittiyse iki parca: "1 Ad. ... Set" teslim, "1 Ad.
 * ... Set" bekliyor. Yatak gitmis baza ve baslik kalmissa urun adi ve
 * parcalari kendi renginde: depocu neyin gittigini, neyin kaldigini gorsun.
 */
export function summaryItems(line: SummaryLine, components: LineComponent[]): SummaryItem[] {
  const full = (delivered: boolean) => [{ text: lineText(line, line.quantity), delivered }];
  if (components.length === 0) return full(false);
  if (components.every((c) => c.deliveredQuantity >= c.totalQuantity)) return full(true);
  if (components.every((c) => c.deliveredQuantity === 0)) return full(false);

  const sent = components.map((c) => c.deliveredQuantity / c.quantityPerUnit);
  if (sent.every((value) => value === sent[0]) && Number.isInteger(sent[0])) {
    return [
      { text: lineText(line, line.quantity - sent[0]), delivered: false },
      { text: lineText(line, sent[0]), delivered: true },
    ];
  }

  const partName = (c: LineComponent) => (c.name ? colorPartLabel(c.name) : line.description);
  const parts = [...components]
    .sort((a, b) => colorPartOrder(partName(a)) - colorPartOrder(partName(b)))
    .flatMap((c) => {
      const count = (n: number) => `${n > 1 ? `${n} ` : ''}${partName(c)}`;
      const left = c.totalQuantity - c.deliveredQuantity;
      return [
        ...(c.deliveredQuantity > 0 ? [{ label: count(c.deliveredQuantity), delivered: true }] : []),
        ...(left > 0 ? [{ label: count(left), delivered: false }] : []),
      ];
    });
  return [{ text: lineText(line, line.quantity), delivered: false, parts }];
}

/** Ayni numara bosluklu ve bosluksuz yazilmis olabilir; rakamlara gore tekrarsiz. */
function uniquePhones(values: (string | null)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const phone = value?.trim();
    if (!phone) continue;
    const digits = phone.replace(/\D/g, '');
    if (seen.has(digits)) continue;
    seen.add(digits);
    result.push(phone);
  }
  return result;
}
