import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  branches,
  deliveries,
  deliveryLines,
  orderLineComponents,
  orderLines,
  orders,
  stockItems,
} from '@/db/schema';
import type { DbOrTx, Tx } from '@/db/types';
import { recalcOrderStatus } from '@/domain/orders/orders';
import { scopeFilter, type Scope } from '@/domain/scope';
import { warehouseOf } from '@/domain/branches';
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

  return runInTransaction(db, async (tx) => {
    // Merkez baska subenin siparisini de teslim edebilir; `scopeFilter` buna
    // izin verir. Mal yine o siparisin bagli oldugu depodan cikar, teslimati
    // gireninkinden degil. Irsaliye numarasi da siparisin sube kodunu tasir:
    // belge o subenin defterine giriyor.
    const [row] = await tx
      .select({ order: orders, branchCode: branches.code })
      .from(orders)
      .innerJoin(branches, eq(branches.id, orders.branchId))
      .where(and(eq(orders.id, input.orderId), scopeFilter(scope, orders.branchId)));
    if (!row) throw new NotFoundError('Siparis');
    const order = row.order;

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
        lineDescription: orderLines.description,
        stockItemName: stockItems.name,
      })
      .from(orderLineComponents)
      .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
      // leftJoin sart: serbest satirin stok karti yok. innerJoin olsaydi
      // bilesen bulunamaz, teslimat "Siparis bileseni bulunamadi" derdi.
      .leftJoin(stockItems, eq(stockItems.id, orderLineComponents.stockItemId))
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
          `${entry.stockItemName ?? entry.lineDescription} icin kalan ${remaining} adet, ` +
            `${requested} adet teslim edilemez.`,
          'OVER_DELIVERY',
        );
      }
    }

    const deliveryNo = await nextDocumentNumber(tx, 'delivery', {
      branchCode: row.branchCode,
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

    // Serbest satirlarin stok karti yok; teslim edildi olarak isaretlenir ama
    // stoktan dusecek bir sey yoktur.
    const stockMoves = components.flatMap((entry) =>
      entry.component.stockItemId === null
        ? []
        : [
            {
              stockItemId: entry.component.stockItemId,
              quantityChange: -(merged.get(entry.component.id) as number),
              movementType: 'delivery' as const,
              referenceType: 'delivery',
              referenceId: delivery.id,
            },
          ],
    );
    await applyMovements(tx, await warehouseOf(tx, order.branchId), stockMoves, {
      allowNegative: input.allowNegativeStock ?? false,
    });

    await recalcOrderStatus(tx, input.orderId);

    return delivery;
  });
}

export interface DeliverRemainingOptions {
  deliveredBy?: string | null;
  receiverName?: string | null;
  idempotencyKey?: string | null;
  allowNegativeStock?: boolean;
}

/**
 * Sipariste teslim edilmemis ne varsa hepsini tek hamlede teslim eder.
 *
 * Sevkiyat ekranindaki "Teslim edildi" dugmesinin karsiligi: arac dondugunde
 * durak durak parca isaretlemek yerine tek tiklama. Kismi teslimat gerektiginde
 * siparis detayindaki ayrintili form kullanilmaya devam ediyor.
 *
 * Okuma ve yazma ayni transaction icinde: arada baska bir teslimat girilirse
 * iki kere dusmus olmayalim.
 */
export async function deliverRemaining(
  db: DbOrTx,
  scope: Scope,
  orderId: string,
  options: DeliverRemainingOptions = {},
): Promise<Delivery> {
  return runInTransaction(db, async (tx) => {
    const rows = await tx
      .select({
        id: orderLineComponents.id,
        remaining: sql<number>`(${orderLineComponents.totalQuantity} - ${orderLineComponents.deliveredQuantity})::int`,
      })
      .from(orderLineComponents)
      .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(
        and(
          eq(orderLines.orderId, orderId),
          scopeFilter(scope, orders.branchId),
          sql`${orderLineComponents.totalQuantity} > ${orderLineComponents.deliveredQuantity}`,
        ),
      );

    if (rows.length === 0) {
      throw new DomainError('Bu sipariste teslim edilecek parca kalmadi.', 'NOTHING_TO_DELIVER');
    }

    return createDelivery(tx, scope, {
      orderId,
      deliveredBy: options.deliveredBy,
      receiverName: options.receiverName,
      idempotencyKey: options.idempotencyKey,
      allowNegativeStock: options.allowNegativeStock,
      lines: rows.map((row) => ({
        orderLineComponentId: row.id,
        quantity: Number(row.remaining),
      })),
    });
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
      lineDescription: orderLines.description,
      sizeLabel: stockItems.sizeLabel,
    })
    .from(deliveryLines)
    .innerJoin(
      orderLineComponents,
      eq(orderLineComponents.id, deliveryLines.orderLineComponentId),
    )
    .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
    // Serbest satir teslimat gecmisinde de gorunmeli; adi siparis satirindan.
    .leftJoin(stockItems, eq(stockItems.id, orderLineComponents.stockItemId))
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
        stockItemName: line.stockItemName ?? line.lineDescription,
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
