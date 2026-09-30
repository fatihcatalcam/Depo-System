import { asc, inArray } from 'drizzle-orm';
import { orderLines, payments } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
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
  /** "2 Ad. 90x190 Fresh Cell Yatak + 100x200 Dozy Yatak" */
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
  const [lineRows, paymentRows] = await Promise.all([
    db
      .select({
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
        orderId: payments.orderId,
        method: payments.method,
        installments: payments.installments,
        amountKurus: payments.amountKurus,
      })
      .from(payments)
      .where(inArray(payments.orderId, ids)),
  ]);

  const items = new Map<string, string[]>();
  for (const line of lineRows) {
    const text = `${line.quantity > 1 ? `${line.quantity} Ad. ` : ''}${line.description}${
      line.isGift ? ' (hediye)' : ''
    }`;
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
