import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDelivery, listDeliveriesForOrder } from '@/domain/orders/deliveries';
import { cancelOrder, confirmOrder, createOrder, getOrder } from '@/domain/orders/orders';
import { createCustomer } from '@/domain/parties/parties';
import { getDailyShipment } from '@/domain/shipments';
import { getAvailability } from '@/domain/stock/availability';
import { makeBedSet } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;
let sequence = 0;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

/**
 * Serbest satir: katalogda olmayan, disaridan yaptirilan urun. Musteri
 * "bazen dısarıdan urun yaptiriliyor" dedi; stok karti acmak zorunda
 * kalmadan siparise yazilabilmeli.
 */
async function orderWithCustom(options: { quantity?: number; withSet?: boolean } = {}) {
  const tag = `OZL${(++sequence).toString().padStart(3, '0')}`;
  const set = options.withSet
    ? await makeBedSet(ctx.db, { model: tag, size: '160x200', stock: 5 })
    : null;
  const customer = await createCustomer(ctx.db, ctx.scope, { name: `Musteri ${tag}` });

  const order = await createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-08-10',
    plannedDeliveryDate: '2026-08-12',
    deliveryAddress: 'Ornek Mah. 1. Sok.',
    lines: [
      ...(set
        ? [
            {
              itemType: 'product' as const,
              productId: set.product.id,
              quantity: 1,
              unitPriceKurus: 3_000_000,
            },
          ]
        : []),
      {
        itemType: 'custom' as const,
        description: 'Ozel olcu sehpa (ceviz, 120x40)',
        quantity: options.quantity ?? 1,
        unitPriceKurus: 450_000,
      },
    ],
  });

  return { order, set, customer };
}

describe('serbest satir', () => {
  it('stok karti olmadan siparise yazilir ve fiyatlanir', async () => {
    const { order } = await orderWithCustom({ quantity: 2 });

    expect(order.subtotalKurus).toBe(900_000);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    const line = detail.lines[0];
    expect(line.itemType).toBe('custom');
    expect(line.description).toBe('Ozel olcu sehpa (ceviz, 120x40)');
    expect(line.productId).toBeNull();
    expect(line.stockItemId).toBeNull();
  });

  it('urun adi bos birakilamaz', async () => {
    const customer = await createCustomer(ctx.db, ctx.scope, { name: 'Bos Serbest' });
    await expect(
      createOrder(ctx.db, ctx.scope, {
        customerId: customer.id,
        orderDate: '2026-08-10',
        deliveryAddress: 'Adres',
        lines: [{ itemType: 'custom', description: '   ', quantity: 1, unitPriceKurus: 1000 }],
      }),
    ).rejects.toThrow('Serbest satirda urun adi yazilmali');
  });

  /**
   * Stok karti olmadigi icin rezervasyon uretmemeli — ama teslimati takip
   * edilmeli. Bilesen satiri yazilmasaydi siparis hicbir zaman "teslim
   * edildi" olamazdi.
   */
  it('onaylaninca stok rezerve etmez ama teslimat takibi acilir', async () => {
    const { order, set } = await orderWithCustom({ withSet: true });
    await confirmOrder(ctx.db, ctx.scope, order.id);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    const custom = detail.lines.find((l) => l.itemType === 'custom');
    expect(custom?.components).toHaveLength(1);
    expect(custom?.components[0].isCustom).toBe(true);
    expect(custom?.components[0].stockItemId).toBeNull();
    expect(custom?.components[0].remainingQuantity).toBe(1);

    // Setin parcalari rezerve olurken serbest satir stogu etkilemedi.
    expect((await getAvailability(ctx.db, set!.yatak.id)).reserved).toBe(1);
  });

  it('teslim edilir, stok hareketi uretmez, siparis kapanir', async () => {
    const { order } = await orderWithCustom({ quantity: 3 });
    await confirmOrder(ctx.db, ctx.scope, order.id);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    const component = detail.lines[0].components[0];

    await createDelivery(ctx.db, ctx.scope, {
      orderId: order.id,
      lines: [{ orderLineComponentId: component.id, quantity: 3 }],
    });

    const after = await getOrder(ctx.db, ctx.scope, order.id);
    expect(after.status).toBe('delivered');
    expect(after.lines[0].components[0].deliveredQuantity).toBe(3);

    // Teslimat gecmisinde adi siparis satirindan geliyor.
    const deliveries = await listDeliveriesForOrder(ctx.db, ctx.scope, order.id);
    expect(deliveries[0].lines[0].stockItemName).toBe('Ozel olcu sehpa (ceviz, 120x40)');
  });

  it('kismi teslimat serbest satirda da calisir', async () => {
    const { order } = await orderWithCustom({ quantity: 4 });
    await confirmOrder(ctx.db, ctx.scope, order.id);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    await createDelivery(ctx.db, ctx.scope, {
      orderId: order.id,
      lines: [{ orderLineComponentId: detail.lines[0].components[0].id, quantity: 1 }],
    });

    const after = await getOrder(ctx.db, ctx.scope, order.id);
    expect(after.status).toBe('partially_delivered');
    expect(after.lines[0].components[0].remainingQuantity).toBe(3);
  });

  /**
   * Sofor serbest urunu de goturuyor. Toplama listesinde gorunmezse depoda
   * unutulur ve musteri eksik mal alir.
   */
  it('toplama listesinde ve durakta gorunur', async () => {
    const fresh = await createTestDb();
    const customer = await createCustomer(fresh.db, fresh.scope, { name: 'Sevkiyat' });
    const order = await createOrder(fresh.db, fresh.scope, {
      customerId: customer.id,
      orderDate: '2026-08-10',
      plannedDeliveryDate: '2026-08-12',
      deliveryAddress: 'Adres',
      lines: [
        {
          itemType: 'custom',
          description: 'Ozel vestiyer',
          quantity: 2,
          unitPriceKurus: 250_000,
        },
      ],
    });
    await confirmOrder(fresh.db, fresh.scope, order.id);

    const shipment = await getDailyShipment(fresh.db, fresh.scope, '2026-08-12');
    expect(shipment.pickingList).toHaveLength(1);
    expect(shipment.pickingList[0].stockItemName).toBe('Ozel vestiyer');
    expect(shipment.pickingList[0].stockItemId).toBeNull();
    expect(shipment.totalPieces).toBe(2);
    expect(shipment.stops[0].items[0].stockItemName).toBe('Ozel vestiyer');

    await fresh.close();
  });

  it('iptalde stok iadesi denemez', async () => {
    const { order } = await orderWithCustom({ quantity: 2 });
    await confirmOrder(ctx.db, ctx.scope, order.id);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    await createDelivery(ctx.db, ctx.scope, {
      orderId: order.id,
      lines: [{ orderLineComponentId: detail.lines[0].components[0].id, quantity: 2 }],
    });

    // Teslim edilmis serbest satir var; iptal stok hareketi uretmeden gecmeli.
    const cancelled = await cancelOrder(ctx.db, ctx.scope, order.id);
    expect(cancelled.status).toBe('cancelled');

    const after = await getOrder(ctx.db, ctx.scope, order.id);
    expect(after.lines[0].components[0].deliveredQuantity).toBe(0);
  });

  it('serbest satir hediye de edilebilir', async () => {
    const customer = await createCustomer(ctx.db, ctx.scope, { name: 'Hediye Serbest' });
    const order = await createOrder(ctx.db, ctx.scope, {
      customerId: customer.id,
      orderDate: '2026-08-10',
      deliveryAddress: 'Adres',
      lines: [
        {
          itemType: 'custom',
          description: 'Ozel yapim yastik',
          quantity: 1,
          unitPriceKurus: 60_000,
          isGift: true,
        },
      ],
    });

    expect(order.totalKurus).toBe(0);
    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.lines[0].isGift).toBe(true);
  });
});
