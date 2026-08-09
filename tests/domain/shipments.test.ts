import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDelivery } from '@/domain/orders/deliveries';
import { confirmOrder, createOrder, getOrder } from '@/domain/orders/orders';
import { addPayment } from '@/domain/orders/payments';
import { getDailyShipment } from '@/domain/shipments';
import { makeBedSet, makeOrderCustomer } from '../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

const DAY = '2026-08-12';
const OTHER_DAY = '2026-08-13';

async function orderFor(options: {
  date: string | null;
  quantity?: number;
  confirm?: boolean;
  model?: string;
}) {
  const set = await makeBedSet(ctx.db, {
    model: options.model ?? `S${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    size: '160x200',
  });
  const customer = await makeOrderCustomer(ctx.db);

  const order = await createOrder(ctx.db, {
    customerId: customer.id,
    orderDate: '2026-08-08',
    plannedDeliveryDate: options.date,
    deliveryAddress: 'Ornek Mah. 5. Sok. No:9',
    deliveryPhone: '0555 111 22 33',
    lines: [
      {
        itemType: 'product',
        productId: set.product.id,
        quantity: options.quantity ?? 1,
        unitPriceKurus: 3_000_000,
      },
    ],
  });

  if (options.confirm !== false) await confirmOrder(ctx.db, order.id);
  return { order, set, customer };
}

describe('getDailyShipment', () => {
  it('o gune planlanmis onayli siparisleri listeler', async () => {
    const { order, customer } = await orderFor({ date: DAY });

    const shipment = await getDailyShipment(ctx.db, DAY);

    const stop = shipment.stops.find((s) => s.orderId === order.id);
    expect(stop).toBeDefined();
    expect(stop?.customerName).toBe(customer.name);
    expect(stop?.deliveryAddress).toBe('Ornek Mah. 5. Sok. No:9');
    expect(stop?.items).toHaveLength(3);
  });

  it('baska gune planlanmis siparis gelmez', async () => {
    const { order } = await orderFor({ date: OTHER_DAY });
    const shipment = await getDailyShipment(ctx.db, DAY);
    expect(shipment.stops.map((s) => s.orderId)).not.toContain(order.id);
  });

  it('taslak siparis sevkiyata girmez', async () => {
    const { order } = await orderFor({ date: DAY, confirm: false });
    const shipment = await getDailyShipment(ctx.db, DAY);
    expect(shipment.stops.map((s) => s.orderId)).not.toContain(order.id);
  });

  it('teslimat tarihi olmayan siparis gelmez', async () => {
    const { order } = await orderFor({ date: null });
    const shipment = await getDailyShipment(ctx.db, DAY);
    expect(shipment.stops.map((s) => s.orderId)).not.toContain(order.id);
  });

  it('teslim edilmis parcalar listede gorunmez', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, { model: 'KISMI', size: '160x200' });
    const customer = await makeOrderCustomer(fresh.db);
    const order = await createOrder(fresh.db, {
      customerId: customer.id,
      orderDate: '2026-08-08',
      plannedDeliveryDate: DAY,
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 2, unitPriceKurus: 100 },
      ],
    });
    await confirmOrder(fresh.db, order.id);

    const detail = await getOrder(fresh.db, order.id);
    const yatak = detail.lines[0].components.find((c) => c.stockItemId === set.yatak.id)!;
    await createDelivery(fresh.db, {
      orderId: order.id,
      lines: [{ orderLineComponentId: yatak.id, quantity: 2 }],
    });

    const shipment = await getDailyShipment(fresh.db, DAY);
    const stop = shipment.stops[0];

    expect(stop.items.map((i) => i.stockItemId)).not.toContain(set.yatak.id);
    expect(stop.items).toHaveLength(2);

    await fresh.close();
  });

  it('toplama listesi parcalari duraklar arasi toplar', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, { model: 'TOPLAMA', size: '160x200', stock: 50 });

    for (const quantity of [2, 3]) {
      const customer = await makeOrderCustomer(fresh.db);
      const order = await createOrder(fresh.db, {
        customerId: customer.id,
        orderDate: '2026-08-08',
        plannedDeliveryDate: DAY,
        deliveryAddress: 'Adres',
        lines: [
          { itemType: 'product', productId: set.product.id, quantity, unitPriceKurus: 100 },
        ],
      });
      await confirmOrder(fresh.db, order.id);
    }

    const shipment = await getDailyShipment(fresh.db, DAY);

    expect(shipment.stops).toHaveLength(2);
    const yatakRow = shipment.pickingList.find((i) => i.stockItemId === set.yatak.id);
    expect(yatakRow?.quantity).toBe(5);
    // 3 parca × 5 adet
    expect(shipment.totalPieces).toBe(15);

    await fresh.close();
  });

  it('sofore tahsil edilecek tutar dogru hesaplanir', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, { model: 'TAHSILAT', size: '160x200' });
    const customer = await makeOrderCustomer(fresh.db);
    const order = await createOrder(fresh.db, {
      customerId: customer.id,
      orderDate: '2026-08-08',
      plannedDeliveryDate: DAY,
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 5_000_000 },
      ],
    });
    await confirmOrder(fresh.db, order.id);
    await addPayment(fresh.db, {
      orderId: order.id,
      amountKurus: 4_000_000,
      method: 'havale',
      paidAt: '2026-08-09',
    });

    const shipment = await getDailyShipment(fresh.db, DAY);

    expect(shipment.stops[0].balanceKurus).toBe(1_000_000);
    expect(shipment.totalCollectionKurus).toBe(1_000_000);

    await fresh.close();
  });

  it('o gun sevkiyat yoksa bos ozet doner', async () => {
    const shipment = await getDailyShipment(ctx.db, '2030-01-01');
    expect(shipment.stops).toEqual([]);
    expect(shipment.pickingList).toEqual([]);
    expect(shipment.totalPieces).toBe(0);
  });
});
