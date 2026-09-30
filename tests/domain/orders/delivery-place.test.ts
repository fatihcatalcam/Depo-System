import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { customers } from '@/db/schema';
import { createOrder, getOrder, listOrders, updateOrder } from '@/domain/orders/orders';
import { makeBedSet } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;
let productId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const set = await makeBedSet(ctx.db, ctx.warehouseId, { model: 'YER', size: '160x200' });
  productId = set.product.id;
});

afterAll(async () => {
  await ctx.close();
});

function orderFor(name: string, place: { district?: string; city?: string; country?: string }) {
  return createOrder(ctx.db, ctx.scope, {
    newCustomer: { name, district: place.district, city: place.city },
    orderDate: '2026-09-10',
    deliveryAddress: 'Kayabaşı Mah.',
    deliveryDistrict: place.district,
    deliveryCity: place.city,
    deliveryCountry: place.country,
    lines: [{ itemType: 'product', productId, quantity: 1, unitPriceKurus: 100_000 }],
  });
}

describe('teslimat yeri', () => {
  it('ilce kaydedilir, il ve ulke bos birakilirsa varsayilan', async () => {
    const order = await orderFor('Yer 1', { district: 'Başakşehir' });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.deliveryDistrict).toBe('Başakşehir');
    expect(detail.deliveryCity).toBe('İstanbul');
    expect(detail.deliveryCountry).toBe('Türkiye');
  });

  /** Bir dahaki sipariste musteri secilince ilce hazir gelsin. */
  it('yeni musteriye de ilce ve il yazilir', async () => {
    const order = await orderFor('Yer 2', { district: 'Kartal', city: 'İstanbul' });
    const [customer] = await ctx.db
      .select()
      .from(customers)
      .where(eq(customers.id, order.customerId));
    expect(customer.district).toBe('Kartal');
    expect(customer.city).toBe('İstanbul');
  });

  it('yurt disi teslimat', async () => {
    const order = await orderFor('Yer 3', { city: 'Sofya', country: 'Bulgaristan' });
    expect(order.deliveryCountry).toBe('Bulgaristan');
    expect(order.deliveryCity).toBe('Sofya');
  });

  /** Il ve ulke hic bos kalmaz: silinirse varsayilana doner. */
  it('il silinirse Istanbul olur, ilce silinirse bos kalir', async () => {
    const order = await orderFor('Yer 4', { district: 'Pendik', city: 'Kocaeli' });
    await updateOrder(ctx.db, ctx.scope, order.id, { deliveryCity: '', deliveryDistrict: '' });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.deliveryCity).toBe('İstanbul');
    expect(detail.deliveryDistrict).toBeNull();
  });

  it('siparis aramasi ilceyi de tariyor', async () => {
    await orderFor('Yer 5', { district: 'Ümraniye' });
    const found = await listOrders(ctx.db, ctx.scope, { query: 'umraniye' });
    expect(found.map((order) => order.customerName)).toEqual(['Yer 5']);
  });
});
