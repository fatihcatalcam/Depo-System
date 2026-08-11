import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  deliveries,
  deliveryLines,
  orderLineComponents,
  orderLines,
  orders,
  stockItems,
} from '@/db/schema';
import type { DbOrTx, Tx } from '@/db/types';
import { recalcOrderStatus } from '@/domain/orders/orders';
import { requireBranch, scopeFilter, type Scope } from '@/domain/scope';
import { applyMovements } from '@/domain/stock/movements';
import { nextDocumentNumber } from '@/lib/counters';
import { DomainError, NotFoundError } from '@/lib/errors';

export type Delivery = typeof deliveries.$inferSelect;

export interface DeliveryLineInput {
  orderLineComponentId: string;
  quantity: number;
}

export interface CreateDeliveryInput {
  orderId: string;
  /** Bos birakilirsa su an kullanilir. */
  deliveredAt?: Date;
  deliveredBy?: string | null;
  receiverName?: string | null;
  notes?: string | null;
  lines: DeliveryLineInput[];
  /**
   * Ayni teslimatin iki kez kaydedilmesini engeller. Kotu internette
   * cift tiklama bu sistemin en klasik hatasi; istemci uretir, biz kontrol ederiz.
   */
  idempotencyKey?: string | null;
  /** Stok yetmiyorsa yine de teslim et (kullanici acikca onayladi). */
  allowNegativeStock?: boolean;
}

/**
 * Kismi teslimat. Bilesen seviyesinde calisir: "yatak bugun gitti, baza hafta
 * sonu" senaryosunun karsiligi budur.
 *
 * Teslimat kaydi, bilesen guncellemesi, stok hareketi ve siparis durumu
 * ayni transaction icinde yazilir.
 */
export async function createDelivery(
  db: DbOrTx,
  scope: Scope,
  input: CreateDeliveryInput,
): Promise<Delivery> {
  if (input.lines.length === 0) {
    throw new DomainError('Teslimat en az bir satir icermeli.', 'EMPTY_DELIVERY');
  }

  const merged = new Map<string, number>();
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new DomainError('Teslim adedi sifirdan buyuk tam sayi olmali.', 'INVALID_QUANTITY');
    }
    merged.set(
      line.orderLineComponentId,
      (merged.get(line.orderLineComponentId) ?? 0) + line.quantity,
    );
  }

  // Teslimat kaydi bir yazma islemidir; yonetici yapamaz.
  const branch = requireBranch(scope);

  return runInTransaction(db, async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.branchId, branch.id)));
    if (!order) throw new NotFoundError('Siparis');

    if (order.status === 'draft') {
      throw new DomainError('Taslak siparis teslim edilemez, once onaylayin.', 'INVALID_STATUS');
    }
    if (order.status === 'cancelled') {
      throw new DomainError('Iptal edilmis siparis teslim edilemez.', 'INVALID_STATUS');
    }

    if (input.idempotencyKey) {
      const [existing] = await tx
        .select()
        .from(deliveries)
        .where(
          and(eq(deliveries.orderId, input.orderId), eq(deliveries.notes, input.idempotencyKey)),
        );
      if (existing) return existing;
    }

    const componentIds = [...merged.keys()];
    const components = await tx
      .select({
        component: orderLineComponents,
        orderId: orderLines.orderId,
        stockItemName: stockItems.name,
      })
      .from(orderLineComponents)
      .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
      .innerJoin(stockItems, eq(stockItems.id, orderLineComponents.stockItemId))
      .where(inArray(orderLineComponents.id, componentIds));

    if (components.length !== componentIds.length) {
      throw new NotFoundError('Siparis bileseni');
    }

    for (const entry of components) {
      if (entry.orderId !== input.orderId) {
        throw new DomainError('Bilesen bu siparise ait degil.', 'INVALID_COMPONENT');
      }
      const requested = merged.get(entry.component.id) ?? 0;
      const remaining = entry.component.totalQuantity - entry.component.deliveredQuantity;
      if (requested > remaining) {
        throw new DomainError(
          `${entry.stockItemName} icin kalan ${remaining} adet, ${requested} adet teslim edilemez.`,
          'OVER_DELIVERY',
        );
      }
    }

    const deliveryNo = await nextDocumentNumber(tx, 'delivery', {
      branchCode: branch.code,
      year: (input.deliveredAt ?? new Date()).getFullYear(),
    });

    const [delivery] = await tx
      .insert(deliveries)
      .values({
        deliveryNo,
        orderId: input.orderId,
        deliveredAt: input.deliveredAt ?? new Date(),
        deliveredBy: input.deliveredBy?.trim() || null,
        receiverName: input.receiverName?.trim() || null,
        notes: input.idempotencyKey ?? input.notes?.trim() ?? null,
      })
      .returning();

    await tx.insert(deliveryLines).values(
      componentIds.map((componentId) => ({
        deliveryId: delivery.id,
        orderLineComponentId: componentId,
        quantity: merged.get(componentId) as number,
      })),
    );

    for (const entry of components) {
      const quantity = merged.get(entry.component.id) as number;
      await tx
        .update(orderLineComponents)
        .set({ deliveredQuantity: entry.component.deliveredQuantity + quantity })
        .where(eq(orderLineComponents.id, entry.component.id));
    }

    await applyMovements(
      tx,
      components.map((entry) => ({
        stockItemId: entry.component.stockItemId,
        quantityChange: -(merged.get(entry.component.id) as number),
        movementType: 'delivery' as const,
        referenceType: 'delivery',
        referenceId: delivery.id,
      })),
      { allowNegative: input.allowNegativeStock ?? false },
    );

    await recalcOrderStatus(tx, input.orderId);

    return delivery;
  });
}

export interface DeliveryLineDetail {
  id: string;
  stockItemName: string;
  sizeLabel: string | null;
  quantity: number;
}

export interface DeliveryDetail extends Delivery {
  lines: DeliveryLineDetail[];
}

/**
 * Teslimatlar `branchId` tasimaz; subelerini bagli olduklari siparisten
 * alirlar. Bu yuzden kapsam suzgeci `orders` uzerinden isliyor.
 */
export async function listDeliveriesForOrder(
  db: DbOrTx,
  scope: Scope,
  orderId: string,
): Promise<DeliveryDetail[]> {
  const rows = await db
    .select({ delivery: deliveries })
    .from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId))
    .where(and(eq(deliveries.orderId, orderId), scopeFilter(scope, orders.branchId)))
    .orderBy(desc(deliveries.deliveredAt))
    .then((result) => result.map((entry) => entry.delivery));

  if (rows.length === 0) return [];

  const lines = await db
    .select({
      id: deliveryLines.id,
      deliveryId: deliveryLines.deliveryId,
      quantity: deliveryLines.quantity,
      stockItemName: stockItems.name,
      sizeLabel: stockItems.sizeLabel,
    })
    .from(deliveryLines)
    .innerJoin(
      orderLineComponents,
      eq(orderLineComponents.id, deliveryLines.orderLineComponentId),
    )
    .innerJoin(stockItems, eq(stockItems.id, orderLineComponents.stockItemId))
    .where(
      inArray(
        deliveryLines.deliveryId,
        rows.map((row) => row.id),
      ),
    );

  return rows.map((row) => ({
    ...row,
    lines: lines
      .filter((line) => line.deliveryId === row.id)
      .map((line) => ({
        id: line.id,
        stockItemName: line.stockItemName,
        sizeLabel: line.sizeLabel,
        quantity: line.quantity,
      })),
  }));
}

async function runInTransaction<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const maybeTx = db as Partial<Tx>;
  if (typeof maybeTx.rollback === 'function') return fn(db as Tx);
  return (db as { transaction: <R>(cb: (tx: Tx) => Promise<R>) => Promise<R> }).transaction(fn);
}
