import { and, eq, inArray, sql } from 'drizzle-orm';
import { orderLineComponents, orderLines, orders, stockItems } from '@/db/schema';
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
 * Rezerve miktarlar ayri bir tabloda tutulmaz, her seferinde siparislerden
 * hesaplanir. Boylece "rezervasyon tablosu ile siparis tablosunun birbirinden
 * kaymasi" diye bir hata sinifi hic dogmaz.
 */
export async function getReservedQuantities(
  db: DbOrTx,
  stockItemIds?: string[],
): Promise<Map<string, number>> {
  if (stockItemIds && stockItemIds.length === 0) return new Map();

  const conditions = [inArray(orders.status, [...RESERVING_STATUSES])];
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

  return new Map(rows.map((row) => [row.stockItemId, Number(row.reserved)]));
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
