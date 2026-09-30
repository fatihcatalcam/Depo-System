import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createOrder, listOrders } from '@/domain/orders/orders';
import { createCustomer } from '@/domain/parties/parties';
import { makeBedSet } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;
let orderNo: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const set = await makeBedSet(ctx.db, ctx.warehouseId, { model: 'ARAMA', size: '160x200' });

  const customer = await createCustomer(ctx.db, ctx.scope, {
    name: 'ERSİN GÖKTAŞ',
    phone: '0532 546 53 56',
    address: 'Başakşehir',
  });
  const order = await createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-09-10',
    deliveryAddress: 'Kayabaşı Mah. Başakşehir',
    deliveryPhone2: '05441112233',
    lines: [
      { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 100_000 },
    ],
  });
  orderNo = order.orderNo;

  const other = await createCustomer(ctx.db, ctx.scope, { name: 'ALPER TANRIVERDİ' });
  await createOrder(ctx.db, ctx.scope, {
    customerId: other.id,
    orderDate: '2026-09-11',
    deliveryAddress: 'Kadıköy',
    lines: [
      { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 100_000 },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

async function search(query: string) {
  return (await listOrders(ctx.db, ctx.scope, { query })).map((order) => order.customerName);
}

describe('siparis aramasi', () => {
  it('musteri adiyla bulur', async () => {
    expect(await search('ersin')).toEqual(['ERSİN GÖKTAŞ']);
  });

  /** Telefonda Turkce klavye her zaman acik degil. */
  it('Turkce karaktersiz yazilani da bulur', async () => {
    expect(await search('goktas')).toEqual(['ERSİN GÖKTAŞ']);
    expect(await search('tanriverdi')).toEqual(['ALPER TANRIVERDİ']);
  });

  /** Kayitta bosluklu, aramada bitisik (ya da tersi) olabilir. */
  it('telefonu bosluklardan bagimsiz bulur', async () => {
    expect(await search('5465356')).toEqual(['ERSİN GÖKTAŞ']);
    expect(await search('0544 111')).toEqual(['ERSİN GÖKTAŞ']);
  });

  it('siparis numarasi ve adresle bulur', async () => {
    expect(await search(orderNo)).toEqual(['ERSİN GÖKTAŞ']);
    expect(await search('kadikoy')).toEqual(['ALPER TANRIVERDİ']);
  });

  it('LIKE jokerleri harfiyen aranir', async () => {
    expect(await search('%')).toEqual([]);
  });

  it('bos arama hepsini getirir', async () => {
    expect(await search('  ')).toHaveLength(2);
  });

  it('listede musteri telefonu da geliyor', async () => {
    const [order] = await listOrders(ctx.db, ctx.scope, { query: 'ersin' });
    expect(order.customerPhone).toBe('0532 546 53 56');
  });
});
