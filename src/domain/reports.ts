import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  branches,
  deliveries,
  orderLines,
  orders,
  payments,
  stockBalances,
  stockItems,
} from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { scopeFilter, type Scope } from './scope';

export interface TopProductRow {
  description: string;
  quantity: number;
  revenueKurus: number;
}

/** Tek bir subenin donem rakamlari. Merkez raporunda satir satir gosterilir. */
export interface BranchPeriodRow {
  branchId: string;
  branchName: string;
  orderCount: number;
  revenueKurus: number;
  collectedKurus: number;
  deliveryCount: number;
  outstandingKurus: number;
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
  /**
   * Alis fiyati tanimli parcalarin stok degeri (anlik).
   *
   * **Her zaman yalnizca kendi deposu** — merkez dahil. Iki sube ayni depoyu
   * paylasiyorsa ayni rakami gorur; rakamin sube kiriliminda yer almamasinin
   * sebebi de bu, depo subeye bolunemez.
   */
  stockValueKurus: number;
  topProducts: TopProductRow[];
  /**
   * Gorunen subelerin ayri ayri rakamlari. Sube hesabinda tek satir
   * (kendisi), merkezde her sube icin bir satir.
   */
  branches: BranchPeriodRow[];
}

const OPEN_STATUSES = ['draft', 'confirmed', 'partially_delivered', 'delivered'] as const;

export async function getPeriodSummary(
  db: DbOrTx,
  scope: Scope,
  from: string,
  to: string,
): Promise<PeriodSummary> {
  const branchOnly = scopeFilter(scope, orders.branchId);

  const periodOrders = and(
    gte(orders.orderDate, from),
    lte(orders.orderDate, to),
    inArray(orders.status, [...OPEN_STATUSES]),
    branchOnly,
  );

  // Butun sorgular subeye gore gruplaniyor; genel toplam satirlarin toplami.
  // Ayni sorguyu bir de toplam icin calistirmak, iki rakamin birbirinden
  // kayabilmesi demekti.
  const orderStats = await db
    .select({
      branchId: orders.branchId,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.totalKurus}), 0)::bigint`,
    })
    .from(orders)
    .where(periodOrders)
    .groupBy(orders.branchId);

  // Odeme ve teslimat kendi sube kolonunu tasimaz; siparise baglanip oradan
  // suzuluyor.
  const collected = await db
    .select({
      branchId: orders.branchId,
      total: sql<number>`coalesce(sum(${payments.amountKurus}), 0)::bigint`,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(and(gte(payments.paidAt, from), lte(payments.paidAt, to), branchOnly))
    .groupBy(orders.branchId);

  const deliveryStats = await db
    .select({ branchId: orders.branchId, count: sql<number>`count(*)::int` })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(
      and(
        gte(deliveries.deliveredAt, new Date(`${from}T00:00:00Z`)),
        lte(deliveries.deliveredAt, new Date(`${to}T23:59:59.999Z`)),
        branchOnly,
      ),
    )
    .groupBy(orders.branchId);

  // Acik bakiye donemden bagimsizdir: "su an ne kadar alacagimiz var".
  //
  // Once siparis basina bakiye hesaplanip sonra toplaniyor. Tek sorguda
  // sum() icine gomulu iliskili alt sorgu gruplamasiz dogru degerlenmiyor;
  // ayrica boylece fazla odenmis bir siparisin negatif bakiyesi baska bir
  // siparisin alacagini goturmez.
  const balances = db
    .select({
      branchId: orders.branchId,
      balance: sql<number>`${orders.totalKurus} - coalesce(sum(${payments.amountKurus}), 0)`.as(
        'balance',
      ),
    })
    .from(orders)
    .leftJoin(payments, eq(payments.orderId, orders.id))
    .where(and(inArray(orders.status, [...OPEN_STATUSES]), branchOnly))
    .groupBy(orders.id, orders.branchId, orders.totalKurus)
    .as('balances');

  const outstanding = await db
    .select({
      branchId: balances.branchId,
      total: sql<number>`coalesce(sum(greatest(${balances.balance}, 0)), 0)::bigint`,
    })
    .from(balances)
    .groupBy(balances.branchId);

  const [stockValue] = await db
    .select({
      total: sql<number>`coalesce(sum(${stockBalances.quantityOnHand} * coalesce(${stockItems.purchasePriceKurus}, 0)), 0)::bigint`,
    })
    .from(stockBalances)
    .innerJoin(stockItems, eq(stockItems.id, stockBalances.stockItemId))
    .where(eq(stockBalances.branchId, scope.stockBranchId));

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

  // Hicbir hareketi olmayan sube de satir olarak gorunsun: "sifir" bir
  // bilgidir, listeden dusmesi ise soru isareti birakir.
  const visibleBranches = await db
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(scope.isCentral ? eq(branches.isActive, true) : eq(branches.id, scope.branchId))
    .orderBy(asc(branches.code));

  const rows: BranchPeriodRow[] = visibleBranches.map((branch) => ({
    branchId: branch.id,
    branchName: branch.name,
    orderCount: Number(orderStats.find((r) => r.branchId === branch.id)?.count ?? 0),
    revenueKurus: Number(orderStats.find((r) => r.branchId === branch.id)?.revenue ?? 0),
    collectedKurus: Number(collected.find((r) => r.branchId === branch.id)?.total ?? 0),
    deliveryCount: Number(deliveryStats.find((r) => r.branchId === branch.id)?.count ?? 0),
    outstandingKurus: Math.max(
      0,
      Number(outstanding.find((r) => r.branchId === branch.id)?.total ?? 0),
    ),
  }));

  const sum = (pick: (row: BranchPeriodRow) => number) => rows.reduce((t, r) => t + pick(r), 0);

  return {
    from,
    to,
    orderCount: sum((row) => row.orderCount),
    revenueKurus: sum((row) => row.revenueKurus),
    collectedKurus: sum((row) => row.collectedKurus),
    deliveryCount: sum((row) => row.deliveryCount),
    outstandingKurus: sum((row) => row.outstandingKurus),
    stockValueKurus: Number(stockValue?.total ?? 0),
    topProducts: topProducts.map((row) => ({
      description: row.description,
      quantity: Number(row.quantity),
      revenueKurus: Number(row.revenue),
    })),
    branches: rows,
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
