import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  customers,
  orderLineComponents,
  orderLines,
  orders,
  payments,
  stockItems,
} from '@/db/schema';
import type { DbOrTx } from '@/db/types';

export interface ShipmentItem {
  stockItemId: string;
  stockItemName: string;
  stockItemSku: string;
  sizeLabel: string | null;
  variantLabel: string | null;
  quantity: number;
}

export interface ShipmentStop {
  orderId: string;
  orderNo: string;
  customerName: string;
  customerPhone: string | null;
  deliveryAddress: string;
  deliveryPhone: string | null;
  deliveryNotes: string | null;
  /** Bu adrese inecek, henuz teslim edilmemis parcalar. */
  items: ShipmentItem[];
  totalKurus: number;
  paidKurus: number;
  /** Sofore "su kadar tahsil et" demek icin. */
  balanceKurus: number;
}

export interface DailyShipment {
  date: string;
  stops: ShipmentStop[];
  /** Parca parca toplam: depocu araca yuklerken tek kagida bakar. */
  pickingList: ShipmentItem[];
  totalPieces: number;
  totalCollectionKurus: number;
}

/**
 * Bir gunun sevkiyati.
 *
 * Listeye giren siparisler: planlanan teslimat tarihi o gune esit **ve**
 * durumu `confirmed` veya `partially_delivered` olanlar. Her siparis icin
 * yalnizca henuz teslim edilmemis bilesenler gosterilir.
 */
export async function getDailyShipment(db: DbOrTx, date: string): Promise<DailyShipment> {
  const orderRows = await db
    .select({
      order: orders,
      customerName: customers.name,
      customerPhone: customers.phone,
      paid: sql<number>`coalesce((
        select sum(${payments.amountKurus}) from ${payments}
        where ${payments.orderId} = ${orders.id}
      ), 0)::bigint`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        eq(orders.plannedDeliveryDate, date),
        inArray(orders.status, ['confirmed', 'partially_delivered']),
      ),
    )
    .orderBy(asc(orders.orderNo));

  if (orderRows.length === 0) {
    return { date, stops: [], pickingList: [], totalPieces: 0, totalCollectionKurus: 0 };
  }

  const componentRows = await db
    .select({
      orderId: orderLines.orderId,
      stockItemId: orderLineComponents.stockItemId,
      remaining: sql<number>`(${orderLineComponents.totalQuantity} - ${orderLineComponents.deliveredQuantity})::int`,
      stockItemName: stockItems.name,
      stockItemSku: stockItems.sku,
      sizeLabel: stockItems.sizeLabel,
      variantLabel: stockItems.variantLabel,
    })
    .from(orderLineComponents)
    .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
    .innerJoin(stockItems, eq(stockItems.id, orderLineComponents.stockItemId))
    .where(
      and(
        inArray(
          orderLines.orderId,
          orderRows.map((row) => row.order.id),
        ),
        sql`${orderLineComponents.totalQuantity} > ${orderLineComponents.deliveredQuantity}`,
      ),
    )
    .orderBy(asc(stockItems.name), asc(stockItems.sizeLabel));

  const stops: ShipmentStop[] = orderRows.map((row) => {
    // Ayni parca birden fazla satirda olabilir (ornegin iki farkli set ayni
    // baslıgi iceriyorsa); durak listesinde tek satirda toplanir.
    const merged = new Map<string, ShipmentItem>();

    for (const component of componentRows.filter((c) => c.orderId === row.order.id)) {
      const existing = merged.get(component.stockItemId);
      if (existing) {
        existing.quantity += Number(component.remaining);
        continue;
      }
      merged.set(component.stockItemId, {
        stockItemId: component.stockItemId,
        stockItemName: component.stockItemName,
        stockItemSku: component.stockItemSku,
        sizeLabel: component.sizeLabel,
        variantLabel: component.variantLabel,
        quantity: Number(component.remaining),
      });
    }

    const paidKurus = Number(row.paid);
    return {
      orderId: row.order.id,
      orderNo: row.order.orderNo,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      deliveryAddress: row.order.deliveryAddress,
      deliveryPhone: row.order.deliveryPhone,
      deliveryNotes: row.order.deliveryNotes,
      items: [...merged.values()],
      totalKurus: row.order.totalKurus,
      paidKurus,
      balanceKurus: row.order.totalKurus - paidKurus,
    };
  });

  const picking = new Map<string, ShipmentItem>();
  for (const stop of stops) {
    for (const item of stop.items) {
      const existing = picking.get(item.stockItemId);
      if (existing) existing.quantity += item.quantity;
      else picking.set(item.stockItemId, { ...item });
    }
  }

  const pickingList = [...picking.values()].sort((a, b) =>
    a.stockItemName.localeCompare(b.stockItemName, 'tr-TR'),
  );

  return {
    date,
    stops,
    pickingList,
    totalPieces: pickingList.reduce((sum, item) => sum + item.quantity, 0),
    totalCollectionKurus: stops.reduce((sum, stop) => sum + Math.max(0, stop.balanceKurus), 0),
  };
}
