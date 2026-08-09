import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  deliveries,
  orderLines,
  orders,
  payments,
  stockItems,
} from '@/db/schema';
import type { DbOrTx } from '@/db/types';

export interface TopProductRow {
  description: string;
  quantity: number;
  revenueKurus: number;
}

export interface PeriodSummary {
  from: string;
  to: string;
  /** Donemde olusturulan, iptal olmayan siparis sayisi. */
  orderCount: number;
  /** Donemde olusturulan siparislerin toplam tutari. */
  revenueKurus: number;
  /** Donemde fiilen tahsil edilen tutar. */
  collectedKurus: number;
  /** Donemde yapilan teslimat belgesi sayisi. */
  deliveryCount: number;
  /** Tum zamanlarin acik bakiyesi (donemden bagimsiz). */
  outstandingKurus: number;
  /** Alis fiyati tanimli parcalarin stok degeri (anlik). */
  stockValueKurus: number;
  topProducts: TopProductRow[];
}

const OPEN_STATUSES = ['draft', 'confirmed', 'partially_delivered', 'delivered'] as const;

export async function getPeriodSummary(
  db: DbOrTx,
  from: string,
  to: string,
): Promise<PeriodSummary> {
  const periodOrders = and(
    gte(orders.orderDate, from),
    lte(orders.orderDate, to),
    inArray(orders.status, [...OPEN_STATUSES]),
  );

  const [orderStats] = await db
    .select({
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.totalKurus}), 0)::bigint`,
    })
    .from(orders)
    .where(periodOrders);

  const [collected] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountKurus}), 0)::bigint` })
    .from(payments)
    .where(and(gte(payments.paidAt, from), lte(payments.paidAt, to)));

  const [deliveryStats] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deliveries)
    .where(
      and(
        gte(deliveries.deliveredAt, new Date(`${from}T00:00:00Z`)),
        lte(deliveries.deliveredAt, new Date(`${to}T23:59:59.999Z`)),
      ),
    );

  // Acik bakiye donemden bagimsizdir: "su an ne kadar alacagimiz var".
  //
  // Once siparis basina bakiye hesaplanip sonra toplaniyor. Tek sorguda
  // sum() icine gomulu iliskili alt sorgu gruplamasiz dogru degerlenmiyor;
  // ayrica boylece fazla odenmis bir siparisin negatif bakiyesi baska bir
  // siparisin alacagini goturmez.
  const balances = db
    .select({
      balance: sql<number>`${orders.totalKurus} - coalesce(sum(${payments.amountKurus}), 0)`.as(
        'balance',
      ),
    })
    .from(orders)
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(inArray(orders.status, [...OPEN_STATUSES]))
    .groupBy(orders.id, orders.totalKurus)
    .as('balances');

  const [outstanding] = await db
    .select({ total: sql<number>`coalesce(sum(greatest(${balances.balance}, 0)), 0)::bigint` })
    .from(balances);

  const [stockValue] = await db
    .select({
      total: sql<number>`coalesce(sum(${stockItems.quantityOnHand} * coalesce(${stockItems.purchasePriceKurus}, 0)), 0)::bigint`,
    })
    .from(stockItems);

  const topProducts = await db
    .select({
      description: orderLines.description,
      quantity: sql<number>`sum(${orderLines.quantity})::int`,
      revenue: sql<number>`coalesce(sum(${orderLines.lineTotalKurus}), 0)::bigint`,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(periodOrders)
    .groupBy(orderLines.description)
    .orderBy(desc(sql`sum(${orderLines.quantity})`))
    .limit(10);

  return {
    from,
    to,
    orderCount: Number(orderStats?.count ?? 0),
    revenueKurus: Number(orderStats?.revenue ?? 0),
    collectedKurus: Number(collected?.total ?? 0),
    deliveryCount: Number(deliveryStats?.count ?? 0),
    outstandingKurus: Math.max(0, Number(outstanding?.total ?? 0)),
    stockValueKurus: Number(stockValue?.total ?? 0),
    topProducts: topProducts.map((row) => ({
      description: row.description,
      quantity: Number(row.quantity),
      revenueKurus: Number(row.revenue),
    })),
  };
}

export type PeriodPreset = 'gun' | 'hafta' | 'ay';

/** Verilen gune gore donem baslangic/bitis tarihlerini uretir. */
export function periodRange(preset: PeriodPreset, reference: string): { from: string; to: string } {
  const date = new Date(`${reference}T00:00:00Z`);

  if (preset === 'gun') return { from: reference, to: reference };

  if (preset === 'hafta') {
    // Pazartesi baslangicli hafta (TR takvimi).
    const day = date.getUTCDay();
    const offset = day === 0 ? 6 : day - 1;
    const start = new Date(date);
    start.setUTCDate(date.getUTCDate() - offset);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { from: iso(start), to: iso(end) };
  }

  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { from: iso(start), to: iso(end) };
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
