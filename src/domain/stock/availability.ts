import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { customers, orderLineComponents, orderLines, orders, stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { isInScope, type Scope } from '@/domain/scope';
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
 * Rezerve miktarlar ayri bir tabloda tutulmaz, her seferinde siparislerden
 * hesaplanir. Boylece "rezervasyon tablosu ile siparis tablosunun birbirinden
 * kaymasi" diye bir hata sinifi hic dogmaz.
 *
 * DIKKAT — bu hesap **bilerek kapsamsizdir (global)**.
 *
 * Stok iki sube arasinda ortak. A subesi bir yatagi rezerve ettiyse o yatak
 * B subesi icin de yoktur. Buraya sube suzgeci eklemek, iki subenin ayni
 * parcayi ayri ayri satmasina yol acar — sistemin cozmesi gereken sorunun ta
 * kendisi. Gizlenen sey rezervasyonun **sebebi** (hangi siparis, hangi
 * musteri); adedi degil.
 */
export async function getReservedQuantities(
  db: DbOrTx,
  stockItemIds?: string[],
): Promise<Map<string, number>> {
  if (stockItemIds && stockItemIds.length === 0) return new Map();

  // Serbest satirlarin (katalogda olmayan urun) stok karti yok; rezervasyon
  // hesabina hic girmemeleri gerekiyor, yoksa gruplama null bir anahtar uretir.
  const conditions = [
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
  /** Kendi subesinin siparisiyse siparis numarasi, degilse null. */
  orderNo: string | null;
  orderId: string | null;
  /** Kendi subesinin siparisiyse musteri adi, degilse "Diger sube". */
  label: string;
  quantity: number;
}

/**
 * Bir parcayi kimin rezerve ettigi.
 *
 * Kendi subesinin siparisleri siparis numarasi ve musteri adiyla gorunur.
 * Diger subeninkiler tek satirda "Diger sube" olarak toplanir: depocu stogun
 * neden yetmedigini anlar ama satis bilgisi karsiya gecmez.
 */
export async function getReservationBreakdown(
  db: DbOrTx,
  scope: Scope,
  stockItemId: string,
): Promise<ReservationLine[]> {
  const rows = await db
    .select({
      orderId: orders.id,
      orderNo: orders.orderNo,
      branchId: orders.branchId,
      customerName: customers.name,
      quantity: sql<number>`sum(${orderLineComponents.totalQuantity} - ${orderLineComponents.deliveredQuantity})::int`,
    })
    .from(orderLineComponents)
    .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        eq(orderLineComponents.stockItemId, stockItemId),
        inArray(orders.status, [...RESERVING_STATUSES]),
        sql`${orderLineComponents.totalQuantity} > ${orderLineComponents.deliveredQuantity}`,
      ),
    )
    .groupBy(orders.id, orders.orderNo, orders.branchId, customers.name)
    .orderBy(orders.orderNo);

  const mine: ReservationLine[] = [];
  let otherBranches = 0;

  for (const row of rows) {
    if (isInScope(scope, row.branchId)) {
      mine.push({
        orderId: row.orderId,
        orderNo: row.orderNo,
        label: row.customerName,
        quantity: Number(row.quantity),
      });
    } else {
      otherBranches += Number(row.quantity);
    }
  }

  if (otherBranches > 0) {
    mine.push({ orderId: null, orderNo: null, label: 'Diger sube', quantity: otherBranches });
  }

  return mine;
}

export async function getAvailability(db: DbOrTx, stockItemId: string): Promise<Availability> {
  const [item] = await db
    .select({ onHand: stockItems.quantityOnHand })
    .from(stockItems)
    .where(eq(stockItems.id, stockItemId));

  if (!item) throw new NotFoundError(`Stok karti (${stockItemId})`);

  const reserved = (await getReservedQuantities(db, [stockItemId])).get(stockItemId) ?? 0;

  return { onHand: item.onHand, reserved, available: item.onHand - reserved };
}
