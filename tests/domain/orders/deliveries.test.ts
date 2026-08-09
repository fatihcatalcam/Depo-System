import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stockItems, stockMovements } from '@/db/schema';
import { createDelivery, listDeliveriesForOrder } from '@/domain/orders/deliveries';
import { cancelOrder, confirmOrder, createOrder, getOrder } from '@/domain/orders/orders';
import { getAvailability } from '@/domain/stock/availability';
import { makeBedSet, makeOrderCustomer } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

async function onHand(id: string) {
  const [row] = await ctx.db
    .select({ q: stockItems.quantityOnHand })
    .from(stockItems)
    .where(eq(stockItems.id, id));
  return row.q;
}

/** Onaylanmis, 2 takim iceren bir siparis kurar. */
async function confirmedOrder(options?: { quantity?: number; stock?: number }) {
  const set = await makeBedSet(ctx.db, {
    model: `D${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    size: '160x200',
    stock: options?.stock ?? 10,
  });
  const customer = await makeOrderCustomer(ctx.db);

  const order = await createOrder(ctx.db, {
    customerId: customer.id,
    orderDate: '2026-08-08',
    deliveryAddress: 'Adres',
    lines: [
      {
        itemType: 'product',
        productId: set.product.id,
        quantity: options?.quantity ?? 2,
        unitPriceKurus: 3_000_000,
      },
    ],
  });
  await confirmOrder(ctx.db, order.id);

  const detail = await getOrder(ctx.db, order.id);
  const component = (stockItemId: string) =>
    detail.lines[0].components.find((c) => c.stockItemId === stockItemId)!;

  return { order, set, detail, component };
}

describe('createDelivery', () => {
  it('kismi teslimat stogu duser ve siparisi kismen teslim yapar', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 2 });

    // Yatak ve baza gidiyor, baslik kaliyor — notlardaki senaryo.
    await createDelivery(ctx.db, {
      orderId: order.id,
      lines: [
        { orderLineComponentId: component(set.yatak.id).id, quantity: 2 },
        { orderLineComponentId: component(set.baza.id).id, quantity: 2 },
      ],
    });

    expect(await onHand(set.yatak.id)).toBe(8);
    expect(await onHand(set.baslik.id)).toBe(10);

    const after = await getOrder(ctx.db, order.id);
    expect(after.status).toBe('partially_delivered');
  });

  it('kalan bilesen rezerve kalir, teslim edilen duser', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 4 });

    await createDelivery(ctx.db, {
      orderId: order.id,
      lines: [{ orderLineComponentId: component(set.yatak.id).id, quantity: 3 }],
    });

    const availability = await getAvailability(ctx.db, set.yatak.id);
    expect(availability.onHand).toBe(7);
    expect(availability.reserved).toBe(1);
    expect(availability.available).toBe(6);
  });

  it('tum bilesenler teslim edilince siparis teslim edildi olur', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 1 });

    await createDelivery(ctx.db, {
      orderId: order.id,
      lines: [
        { orderLineComponentId: component(set.yatak.id).id, quantity: 1 },
        { orderLineComponentId: component(set.baza.id).id, quantity: 1 },
        { orderLineComponentId: component(set.baslik.id).id, quantity: 1 },
      ],
    });

    const after = await getOrder(ctx.db, order.id);
    expect(after.status).toBe('delivered');
    expect((await getAvailability(ctx.db, set.yatak.id)).reserved).toBe(0);
  });

  it('kalandan fazla teslim edilemez', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 2 });

    await expect(
      createDelivery(ctx.db, {
        orderId: order.id,
        lines: [{ orderLineComponentId: component(set.yatak.id).id, quantity: 3 }],
      }),
    ).rejects.toThrow('kalan 2 adet');
  });

  it('iki asamali teslimatta ikinci parti da fazlaya izin vermez', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 5 });

    await createDelivery(ctx.db, {
      orderId: order.id,
      lines: [{ orderLineComponentId: component(set.yatak.id).id, quantity: 3 }],
    });

    await expect(
      createDelivery(ctx.db, {
        orderId: order.id,
        lines: [{ orderLineComponentId: component(set.yatak.id).id, quantity: 3 }],
      }),
    ).rejects.toThrow('kalan 2 adet');
  });

  it('stok yetmiyorsa varsayilan olarak reddedilir', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 8, stock: 5 });

    await expect(
      createDelivery(ctx.db, {
        orderId: order.id,
        lines: [{ orderLineComponentId: component(set.yatak.id).id, quantity: 8 }],
      }),
    ).rejects.toThrow('Stok yetersiz');

    expect(await onHand(set.yatak.id)).toBe(5);
  });

  it('acikca onaylanirsa stok eksiye dusebilir', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 8, stock: 5 });

    await createDelivery(ctx.db, {
      orderId: order.id,
      lines: [{ orderLineComponentId: component(set.yatak.id).id, quantity: 8 }],
      allowNegativeStock: true,
    });

    expect(await onHand(set.yatak.id)).toBe(-3);
  });

  it('taslak siparis teslim edilemez', async () => {
    const set = await makeBedSet(ctx.db, { model: 'TASLAKTESLIM', size: '090x190' });
    const customer = await makeOrderCustomer(ctx.db);
    const order = await createOrder(ctx.db, {
      customerId: customer.id,
      orderDate: '2026-08-08',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 100 },
      ],
    });

    await expect(
      createDelivery(ctx.db, {
        orderId: order.id,
        lines: [{ orderLineComponentId: '11111111-1111-1111-1111-111111111111', quantity: 1 }],
      }),
    ).rejects.toThrow('Taslak siparis teslim edilemez');
  });

  it('iptal edilmis siparis teslim edilemez', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 1 });
    const componentId = component(set.yatak.id).id;
    await cancelOrder(ctx.db, order.id);

    await expect(
      createDelivery(ctx.db, {
        orderId: order.id,
        lines: [{ orderLineComponentId: componentId, quantity: 1 }],
      }),
    ).rejects.toThrow('Iptal edilmis siparis teslim edilemez');
  });

  it('baska siparisin bileseni teslim edilemez', async () => {
    const first = await confirmedOrder({ quantity: 1 });
    const second = await confirmedOrder({ quantity: 1 });

    await expect(
      createDelivery(ctx.db, {
        orderId: second.order.id,
        lines: [
          { orderLineComponentId: first.component(first.set.yatak.id).id, quantity: 1 },
        ],
      }),
    ).rejects.toThrow('Bilesen bu siparise ait degil');
  });

  it('ayni idempotency anahtari ikinci kez stok dusmez', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 3 });
    const key = 'cift-tiklama-testi';

    const first = await createDelivery(ctx.db, {
      orderId: order.id,
      lines: [{ orderLineComponentId: component(set.yatak.id).id, quantity: 2 }],
      idempotencyKey: key,
    });
    const second = await createDelivery(ctx.db, {
      orderId: order.id,
      lines: [{ orderLineComponentId: component(set.yatak.id).id, quantity: 2 }],
      idempotencyKey: key,
    });

    expect(second.id).toBe(first.id);
    expect(await onHand(set.yatak.id)).toBe(8);
  });

  it('bir satir hatali olursa hicbiri uygulanmaz', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 2 });
    const before = await onHand(set.yatak.id);

    await expect(
      createDelivery(ctx.db, {
        orderId: order.id,
        lines: [
          { orderLineComponentId: component(set.yatak.id).id, quantity: 1 },
          { orderLineComponentId: component(set.baza.id).id, quantity: 99 },
        ],
      }),
    ).rejects.toThrow();

    expect(await onHand(set.yatak.id)).toBe(before);
    expect(await listDeliveriesForOrder(ctx.db, order.id)).toHaveLength(0);
  });

  it('hareket kaydi teslimat belgesine baglanir', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 1 });

    const delivery = await createDelivery(ctx.db, {
      orderId: order.id,
      lines: [{ orderLineComponentId: component(set.yatak.id).id, quantity: 1 }],
    });

    const movements = await ctx.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.stockItemId, set.yatak.id));
    const deliveryMovement = movements.find((m) => m.movementType === 'delivery');

    expect(deliveryMovement?.referenceType).toBe('delivery');
    expect(deliveryMovement?.referenceId).toBe(delivery.id);
    expect(deliveryMovement?.quantityChange).toBe(-1);
  });
});

describe('cancelOrder teslimattan sonra', () => {
  it('teslim edilen mal iade hareketiyle stoga geri doner', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 2 });

    await createDelivery(ctx.db, {
      orderId: order.id,
      lines: [{ orderLineComponentId: component(set.yatak.id).id, quantity: 2 }],
    });
    expect(await onHand(set.yatak.id)).toBe(8);

    await cancelOrder(ctx.db, order.id);

    expect(await onHand(set.yatak.id)).toBe(10);
    const movements = await ctx.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.stockItemId, set.yatak.id));
    expect(movements.some((m) => m.movementType === 'return')).toBe(true);
  });
});

describe('listDeliveriesForOrder', () => {
  it('teslimatlari satirlariyla listeler', async () => {
    const { order, set, component } = await confirmedOrder({ quantity: 2 });

    await createDelivery(ctx.db, {
      orderId: order.id,
      deliveredBy: 'Ahmet Sofor',
      receiverName: 'Fatih Catalcam',
      lines: [
        { orderLineComponentId: component(set.yatak.id).id, quantity: 1 },
        { orderLineComponentId: component(set.baza.id).id, quantity: 2 },
      ],
    });

    const list = await listDeliveriesForOrder(ctx.db, order.id);
    expect(list).toHaveLength(1);
    expect(list[0].deliveredBy).toBe('Ahmet Sofor');
    expect(list[0].receiverName).toBe('Fatih Catalcam');
    expect(list[0].lines).toHaveLength(2);
    expect(list[0].deliveryNo).toMatch(/^TS-\d{4}-\d{5}$/);
  });
});
