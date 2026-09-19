import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  customers,
  orderLineComponents,
  orderLines,
  orders,
  stockBalances,
  stockItems,
} from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { NotFoundError } from '@/lib/errors';

/** Rezervasyon ureten siparis durumlari. */
export const RESERVING_STATUSES = ['confirmed', 'partially_delivered'] as const;

export interface Availability {
  /** Depodaki fiziksel adet. */
  onHand: number;
  /** Soz verilmis ama henuz teslim edilmemis adet. */
  reserved: number;
  /** Yeni siparise verilebilecek adet. Negatif olabilir: fazla soz verilmis demektir. */
  available: number;
}

/**
 * Bir subenin deposundaki adetler.
 *
 * Bakiye satiri olmayan kart sifir sayilir; `stock_balances` her sube icin
 * her kartin satirini tasimaz, ilk hareketle dogar.
 */
export async function getOnHandQuantities(
  db: DbOrTx,
  branchId: string,
  stockItemIds?: string[],
): Promise<Map<string, number>> {
  if (stockItemIds && stockItemIds.length === 0) return new Map();

  const conditions = [eq(stockBalances.branchId, branchId)];
  if (stockItemIds) conditions.push(inArray(stockBalances.stockItemId, stockItemIds));

  const rows = await db
    .select({
      stockItemId: stockBalances.stockItemId,
      quantityOnHand: stockBalances.quantityOnHand,
    })
    .from(stockBalances)
    .where(and(...conditions));

  return new Map(rows.map((row) => [row.stockItemId, row.quantityOnHand]));
}

/**
 * Rezerve miktarlar ayri bir tabloda tutulmaz, her seferinde siparislerden
 * hesaplanir. Boylece "rezervasyon tablosu ile siparis tablosunun birbirinden
 * kaymasi" diye bir hata sinifi hic dogmaz.
 *
 * Hesap **subeye baglidir**: her subenin kendi deposu var, A subesinin
 * rezervasyonu B subesinin stogundan dusmez. Bir donem stok tek havuzdu ve bu
 * hesap bilerek kapsamsizdi; depolar ayrilinca o gerekce ortadan kalkti.
 */
export async function getReservedQuantities(
  db: DbOrTx,
  branchId: string,
  stockItemIds?: string[],
): Promise<Map<string, number>> {
  if (stockItemIds && stockItemIds.length === 0) return new Map();

  // Serbest satirlarin (katalogda olmayan urun) stok karti yok; rezervasyon
  // hesabina hic girmemeleri gerekiyor, yoksa gruplama null bir anahtar uretir.
  const conditions = [
    eq(orders.branchId, branchId),
    inArray(orders.status, [...RESERVING_STATUSES]),
    isNotNull(orderLineComponents.stockItemId),
  ];
  if (stockItemIds) {
    conditions.push(inArray(orderLineComponents.stockItemId, stockItemIds));
  }

  const rows = await db
    .select({
      stockItemId: orderLineComponents.stockItemId,
      reserved: sql<number>`sum(${orderLineComponents.totalQuantity} - ${orderLineComponents.deliveredQuantity})::int`,
    })
    .from(orderLineComponents)
    .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(and(...conditions))
    .groupBy(orderLineComponents.stockItemId);

  return new Map(rows.map((row) => [row.stockItemId as string, Number(row.reserved)]));
}

export interface ReservationLine {
  orderNo: string;
  orderId: string;
  /** Musteri adi. */
  label: string;
  quantity: number;
}

/**
 * Bir parcayi kimin rezerve ettigi.
 *
 * Yalnizca bu subenin siparisleri: baska subenin siparisi bu deponun
 * stogunu zaten tutmuyor. Depo ortakken burada bir de "Diger sube" toplami
 * gorunurdu; depolar ayrilinca o satirin anlami kalmadi.
 */
export async function getReservationBreakdown(
  db: DbOrTx,
  branchId: string,
  stockItemId: string,
): Promise<ReservationLine[]> {
  const rows = await db
    .select({
      orderId: orders.id,
      orderNo: orders.orderNo,
      customerName: customers.name,
      quantity: sql<number>`sum(${orderLineComponents.totalQuantity} - ${orderLineComponents.deliveredQuantity})::int`,
    })
    .from(orderLineComponents)
    .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        eq(orders.branchId, branchId),
        eq(orderLineComponents.stockItemId, stockItemId),
        inArray(orders.status, [...RESERVING_STATUSES]),
        sql`${orderLineComponents.totalQuantity} > ${orderLineComponents.deliveredQuantity}`,
      ),
    )
    .groupBy(orders.id, orders.orderNo, customers.name)
    .orderBy(orders.orderNo);

  return rows.map((row) => ({
    orderId: row.orderId,
    orderNo: row.orderNo,
    label: row.customerName,
    quantity: Number(row.quantity),
  }));
}

export async function getAvailability(
  db: DbOrTx,
  branchId: string,
  stockItemId: string,
): Promise<Availability> {
  const [item] = await db
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(eq(stockItems.id, stockItemId));

  if (!item) throw new NotFoundError(`Stok karti (${stockItemId})`);

  const onHand = (await getOnHandQuantities(db, branchId, [stockItemId])).get(stockItemId) ?? 0;
  const reserved = (await getReservedQuantities(db, branchId, [stockItemId])).get(stockItemId) ?? 0;

  return { onHand, reserved, available: onHand - reserved };
}
