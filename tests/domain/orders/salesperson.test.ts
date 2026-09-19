import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { salespeople } from '@/db/schema';
import { createOrder, getOrder, listOrders, updateOrder } from '@/domain/orders/orders';
import { listSalespeople } from '@/domain/parties/salespeople';
import { makeBedSet, makeOrderCustomer } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;
let sequence = 0;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

async function salespersonByName(name: string) {
  const list = await listSalespeople(ctx.db, { includeInactive: true });
  const person = list.find((entry) => entry.name === name);
  if (!person) throw new Error(`${name} listede yok`);
  return person;
}

async function orderWith(salespersonId?: string | null) {
  const tag = `SAT${(++sequence).toString().padStart(3, '0')}`;
  const set = await makeBedSet(ctx.db, ctx.branchId, { model: tag, size: '160x200' });
  const customer = await makeOrderCustomer(ctx.db, ctx.scope);
  return createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-09-15',
    deliveryAddress: 'Adres',
    salespersonId,
    lines: [
      { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 1_000_000 },
    ],
  });
}

describe('satici', () => {
  it('gocle gelen dort satici listede, Turkce harfleriyle', async () => {
    const names = (await listSalespeople(ctx.db)).map((person) => person.name);
    expect(names).toEqual([
      'ASYA AHMEDOVA',
      'BATUHAN YALÇINKAYA',
      'MEHTAP DALBUDAK',
      'ONUR YALÇINKAYA',
    ]);
  });

  it('siparis saticisiyla kaydedilir, detayda ve listede adi gorunur', async () => {
    const mehtap = await salespersonByName('MEHTAP DALBUDAK');
    const order = await orderWith(mehtap.id);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.salespersonId).toBe(mehtap.id);
    expect(detail.salespersonName).toBe('MEHTAP DALBUDAK');

    const list = await listOrders(ctx.db, ctx.scope);
    expect(list.find((row) => row.id === order.id)?.salespersonName).toBe('MEHTAP DALBUDAK');
  });

  it('saticisiz eski siparis de okunabilir', async () => {
    const order = await orderWith(null);
    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.salespersonName).toBeNull();
  });

  it('satici sonradan degistirilebilir', async () => {
    const asya = await salespersonByName('ASYA AHMEDOVA');
    const onur = await salespersonByName('ONUR YALÇINKAYA');
    const order = await orderWith(asya.id);

    await updateOrder(ctx.db, ctx.scope, order.id, { salespersonId: onur.id });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.salespersonName).toBe('ONUR YALÇINKAYA');
  });

  /** Tarih duzeltmek primi baskasina gecirmemeli ya da silmemeli. */
  it('satici gonderilmeyen guncellemede korunur', async () => {
    const batuhan = await salespersonByName('BATUHAN YALÇINKAYA');
    const order = await orderWith(batuhan.id);

    await updateOrder(ctx.db, ctx.scope, order.id, { plannedDeliveryDate: '2026-09-30' });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.salespersonId).toBe(batuhan.id);
  });

  it('olmayan satici reddedilir', async () => {
    await expect(orderWith('00000000-0000-4000-8000-000000000000')).rejects.toThrow('Satici');
  });

  describe('isten ayrilan satici', () => {
    it('yeni siparise atanamaz ama eski siparisi duzenlenebilir', async () => {
      const [temp] = await ctx.db.insert(salespeople).values({ name: 'GECICI SATICI' }).returning();
      const order = await orderWith(temp.id);

      await ctx.db.update(salespeople).set({ isActive: false }).where(eq(salespeople.id, temp.id));

      // Listeden dustu: yeni sipariste secilemez.
      expect((await listSalespeople(ctx.db)).some((p) => p.id === temp.id)).toBe(false);
      await expect(orderWith(temp.id)).rejects.toThrow('aktif degil');

      // Eski siparis ayni saticiyla duzenlenebiliyor; adi kaybolmuyor.
      await updateOrder(ctx.db, ctx.scope, order.id, {
        salespersonId: temp.id,
        deliveryAddress: 'Yeni adres',
      });
      const detail = await getOrder(ctx.db, ctx.scope, order.id);
      expect(detail.salespersonName).toBe('GECICI SATICI');
      expect(detail.deliveryAddress).toBe('Yeni adres');
    });
  });
});
