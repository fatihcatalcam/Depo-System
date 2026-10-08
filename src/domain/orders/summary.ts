import { asc, eq, inArray } from 'drizzle-orm';
import { orderLineComponents, orderLines, payments, stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { colorPartLabel } from '@/domain/orders/line-colors';
import { listOrders, type OrderStatus, type OrderSummary } from '@/domain/orders/orders';
import type { Scope } from '@/domain/scope';
import type { PaymentMethod } from '@/lib/payment-methods';

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

export interface OrderSummaryRow extends OrderSummary {
  /**
   * "2 Ad. 90x190 Fresh Cell Yatak + 100x200 Dozy Yatak". Teslim edilmemis
   * sipariste yalnizca kalanlar: teslim edilen satir duser.
   */
  itemsText: string;
  /** Tekrarsiz: siparisin ve musterinin telefonlari, bu sirayla. */
  phones: string[];
  /** Yontem ve taksit bazinda toplanmis tahsilat. */
  paymentBreakdown: PaymentBreakdown[];
}

export interface SummaryFilters {
  view: SummaryView;
  query?: string;
}

/** Excel sayfasi da bu kadar satirla aciliyor; teslim edilenler zamanla birikir. */
const SUMMARY_LIMIT = 1000;

export async function listOrderSummaries(
  db: DbOrTx,
  scope: Scope,
  filters: SummaryFilters,
): Promise<OrderSummaryRow[]> {
  const list = await listOrders(db, scope, {
    statuses: VIEW_STATUSES[filters.view],
    query: filters.query,
    limit: SUMMARY_LIMIT,
  });
  if (list.length === 0) return [];

  // Satirlar ve odemeler iki sorguda, siparis basina ayri sorgu degil.
  const ids = list.map((order) => order.id);
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
  const delivered = new Set(list.filter((order) => order.status === 'delivered').map((o) => o.id));

  const items = new Map<string, string[]>();
  for (const line of lineRows) {
    // Teslim edilmis sipariste her sey teslim; yazi bos kalmasin diye tam hali.
    const text = delivered.has(line.orderId)
      ? lineText(line, line.quantity)
      : remainingItemText(line, componentsByLine.get(line.id) ?? []);
    if (text === null) continue;
    items.set(line.orderId, [...(items.get(line.orderId) ?? []), text]);
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
    itemsText: (items.get(order.id) ?? []).join(' + '),
    phones: uniquePhones([
      order.deliveryPhone,
      order.deliveryPhone2,
      order.customerPhone,
      order.customerPhone2,
    ]),
    paymentBreakdown: breakdowns.get(order.id) ?? [],
  }));

  // Bekleyenler Excel'deki gibi eskiden yeniye: en uzun bekleyen ustte.
  // Teslim edilenlerde en yenisi ustte.
  return filters.view === 'bekleyen' ? rows.reverse() : rows;
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
 * Satirin henuz teslim edilmemis kismi; tamami teslim edildiyse null.
 *
 * Taslakta bilesen yok (onayda donduruluyor): satir oldugu gibi. Takimin her
 * parcasindan ayni oranda kaldiysa "1 Ad. LATEX MASTER 160x200 Set"; yatak
 * gitmis baza ve baslik kalmissa hangi parcalarin kaldigi yazilir, depocu
 * neyi yukleyecegini bilsin.
 */
export function remainingItemText(line: SummaryLine, components: LineComponent[]): string | null {
  if (components.length === 0) return lineText(line, line.quantity);

  const remaining = components.map((component) => ({
    component,
    left: component.totalQuantity - component.deliveredQuantity,
  }));
  if (remaining.every((entry) => entry.left <= 0)) return null;
  if (remaining.every((entry) => entry.component.deliveredQuantity === 0)) {
    return lineText(line, line.quantity);
  }

  const units = remaining.map((entry) => entry.left / entry.component.quantityPerUnit);
  if (units.every((value) => value === units[0]) && Number.isInteger(units[0])) {
    return lineText(line, units[0]);
  }

  const parts = remaining
    .filter((entry) => entry.left > 0)
    .map((entry) => {
      const label = entry.component.name ? colorPartLabel(entry.component.name) : line.description;
      return `${entry.left > 1 ? `${entry.left} ` : ''}${label}`;
    });
  return `${lineText(line, 1)} (kalan: ${parts.join(', ')})`;
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
