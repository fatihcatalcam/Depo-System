import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deliverRemaining } from '@/domain/orders/deliveries';
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
  setFactoryOrdered,
  updateOrderNotes,
} from '@/domain/orders/orders';
import { makeBedSet, makeOrderCustomer } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;
let productId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  productId = (await makeBedSet(ctx.db, ctx.warehouseId, { model: 'FABRIKA', size: '160x200' }))
    .product.id;
});

afterAll(async () => {
  await ctx.close();
});

async function newOrder(notes?: string) {
  const customer = await makeOrderCustomer(ctx.db, ctx.scope);
  return createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-10-15',
    deliveryAddress: 'Adres',
    notes,
    lines: [{ itemType: 'product', productId, quantity: 1, unitPriceKurus: 100_000 }],
  });
}

describe('fabrikaya siparis gecildi tiki', () => {
  it('isaretlenir ve kaldirilir; listede de gorunur', async () => {
    const order = await newOrder();
    expect(order.factoryOrderedAt).toBeNull();

    const marked = await setFactoryOrdered(ctx.db, ctx.scope, order.id, true);
    expect(marked.factoryOrderedAt).toBeInstanceOf(Date);
    const listed = await listOrders(ctx.db, ctx.scope, {});
    expect(listed.find((row) => row.id === order.id)?.factoryOrderedAt).not.toBeNull();

    const cleared = await setFactoryOrdered(ctx.db, ctx.scope, order.id, false);
    expect(cleared.factoryOrderedAt).toBeNull();
  });

  /** Teslimattan sonra da durur: siparisin durumundan bagimsiz. */
  it('teslim edilmis sipariste de isaretlenir', async () => {
    const order = await newOrder();
    await confirmOrder(ctx.db, ctx.scope, order.id);
    await deliverRemaining(ctx.db, ctx.scope, order.id);
    const marked = await setFactoryOrdered(ctx.db, ctx.scope, order.id, true);
    expect(marked.factoryOrderedAt).not.toBeNull();
  });

  it('iptal edilmis siparis isaretlenemez', async () => {
    const order = await newOrder();
    await cancelOrder(ctx.db, ctx.scope, order.id);
    await expect(setFactoryOrdered(ctx.db, ctx.scope, order.id, true)).rejects.toThrow('Iptal');
  });

  it('baska subenin siparisi isaretlenemez', async () => {
    const order = await newOrder();
    await expect(setFactoryOrdered(ctx.db, ctx.scopes.s2, order.id, true)).rejects.toThrow();
  });
});

describe('siparis notu', () => {
  it('yazilir, degistirilir, bos birakilinca silinir', async () => {
    const order = await newOrder('ilk not');
    await updateOrderNotes(ctx.db, ctx.scope, order.id, '  musteri aradi  ');
    expect((await getOrder(ctx.db, ctx.scope, order.id)).notes).toBe('musteri aradi');

    await updateOrderNotes(ctx.db, ctx.scope, order.id, '   ');
    expect((await getOrder(ctx.db, ctx.scope, order.id)).notes).toBeNull();
  });

  /** Siparisin geri kalani teslimattan sonra kilitli; not degil. */
  it('teslim edilmis sipariste de yazilir', async () => {
    const order = await newOrder();
    await confirmOrder(ctx.db, ctx.scope, order.id);
    await deliverRemaining(ctx.db, ctx.scope, order.id);
    await updateOrderNotes(ctx.db, ctx.scope, order.id, 'fatura sonra kesilecek');
    expect((await getOrder(ctx.db, ctx.scope, order.id)).notes).toBe('fatura sonra kesilecek');
  });
});
