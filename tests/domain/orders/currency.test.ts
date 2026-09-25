import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { orders } from '@/db/schema';
import { confirmOrder, createOrder, getOrder, updateOrder } from '@/domain/orders/orders';
import { addPayment } from '@/domain/orders/payments';
import { getPeriodSummary } from '@/domain/reports';
import { parseRateInput, TRY_RATE } from '@/lib/money';
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

/** 1 USD = 42,1573 TL */
const USD_RATE = parseRateInput('42,1573');

async function newOrder(options: {
  currency?: 'TRY' | 'USD' | 'EUR';
  exchangeRate?: number;
  priceKurus?: number;
}) {
  const tag = `PB${(++sequence).toString().padStart(3, '0')}`;
  const set = await makeBedSet(ctx.db, ctx.warehouseId, {
    model: tag,
    size: '160x200',
    stock: 10,
  });
  const customer = await makeOrderCustomer(ctx.db, ctx.scope);

  return createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-09-10',
    currency: options.currency,
    exchangeRate: options.exchangeRate,
    deliveryAddress: 'Adres',
    lines: [
      {
        itemType: 'product',
        productId: set.product.id,
        quantity: 1,
        unitPriceKurus: options.priceKurus ?? 100_000,
      },
    ],
  });
}

describe('siparis para birimi', () => {
  it('varsayilan TL ve kuru 1,0000', async () => {
    const order = await newOrder({});
    const detail = await getOrder(ctx.db, ctx.scope, order.id);

    expect(detail.currency).toBe('TRY');
    expect(detail.exchangeRate).toBe(TRY_RATE);
  });

  it('dolar siparis kuruyla birlikte kaydedilir', async () => {
    const order = await newOrder({ currency: 'USD', exchangeRate: USD_RATE });
    const detail = await getOrder(ctx.db, ctx.scope, order.id);

    expect(detail.currency).toBe('USD');
    expect(detail.exchangeRate).toBe(USD_RATE);
  });

  /**
   * Kursuz bir doviz siparisi, raporlarda TL karsiligi hesaplanamayan bir
   * satir birakirdi.
   */
  it('kursuz doviz siparisi reddedilir', async () => {
    await expect(newOrder({ currency: 'USD' })).rejects.toThrow('kur girilmeli');
  });

  it('kur 1,0000 degerinden kucuk olamaz', async () => {
    await expect(
      newOrder({ currency: 'EUR', exchangeRate: parseRateInput('0,5000') }),
    ).rejects.toThrow('kucuk olamaz');
  });

  /**
   * TL'nin kuru tanim geregi 1,0000. Veritabani kisiti da ayni seyi soyluyor;
   * alan katmani atlansa bile yanlis veri giremiyor.
   */
  it('TL siparise baska bir kur yazilamaz', async () => {
    const order = await newOrder({});

    await expect(
      ctx.db.update(orders).set({ exchangeRate: USD_RATE }).where(eq(orders.id, order.id)),
    ).rejects.toThrow();
  });

  it('taslak sipariste para birimi degistirilebilir', async () => {
    const order = await newOrder({});

    await updateOrder(ctx.db, ctx.scope, order.id, {
      currency: 'USD',
      exchangeRate: USD_RATE,
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.currency).toBe('USD');
    expect(detail.exchangeRate).toBe(USD_RATE);
  });

  it('onaylanmis siparisin para birimi degistirilemez', async () => {
    const order = await newOrder({});
    await confirmOrder(ctx.db, ctx.scope, order.id);

    await expect(
      updateOrder(ctx.db, ctx.scope, order.id, { currency: 'USD', exchangeRate: USD_RATE }),
    ).rejects.toThrow('Onaylanmis siparisin para birimi');
  });

  /**
   * Alinmis para baska bir birimdeyse siparisin birimini degistirmek o
   * tahsilati anlamsiz kilar: "500 alindi" yazar ama neyden 500 oldugu
   * belirsizlesir.
   */
  it('tahsilati olan siparisin para birimi degistirilemez', async () => {
    const order = await newOrder({});
    await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 50_000,
      method: 'nakit',
      paidAt: '2026-09-10',
      isDeposit: true,
    });

    await expect(
      updateOrder(ctx.db, ctx.scope, order.id, { currency: 'USD', exchangeRate: USD_RATE }),
    ).rejects.toThrow('Tahsilat girilmis');
  });

  /** Yanlis girilmis bir kur duzeltilebilmeli; para birimi ayni kaliyor. */
  it('para birimi ayni kalirken kur duzeltilebilir', async () => {
    const order = await newOrder({ currency: 'USD', exchangeRate: USD_RATE });
    const corrected = parseRateInput('43,0000');

    await updateOrder(ctx.db, ctx.scope, order.id, { exchangeRate: corrected });

    expect((await getOrder(ctx.db, ctx.scope, order.id)).exchangeRate).toBe(corrected);
  });
});

describe('raporlarda para birimi', () => {
  it('doviz siparis TL karsiligiyla toplanir', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.warehouseId, {
      model: 'RAPORPB',
      size: '160x200',
      stock: 10,
    });
    const customer = await makeOrderCustomer(fresh.db, fresh.scope);

    // 1.000,00 TL
    await createOrder(fresh.db, fresh.scope, {
      customerId: customer.id,
      orderDate: '2026-09-10',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 100_000 },
      ],
    });

    // 100,00 USD -> 100 x 42,1573 = 4.215,73 TL
    await createOrder(fresh.db, fresh.scope, {
      customerId: customer.id,
      orderDate: '2026-09-10',
      currency: 'USD',
      exchangeRate: USD_RATE,
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 10_000 },
      ],
    });

    const summary = await getPeriodSummary(fresh.db, fresh.scope, '2026-09-01', '2026-09-30');

    expect(summary.orderCount).toBe(2);
    expect(summary.revenueKurus).toBe(100_000 + 421_573);

    await fresh.close();
  });

  it('doviz tahsilati da TL karsiligiyla toplanir', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.warehouseId, {
      model: 'TAHSPB',
      size: '160x200',
      stock: 10,
    });
    const customer = await makeOrderCustomer(fresh.db, fresh.scope);

    const order = await createOrder(fresh.db, fresh.scope, {
      customerId: customer.id,
      orderDate: '2026-09-10',
      currency: 'USD',
      exchangeRate: USD_RATE,
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 10_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scope, order.id);

    // 40,00 USD tahsil edildi -> 40 x 42,1573 = 1.686,29 TL
    await addPayment(fresh.db, fresh.scope, {
      orderId: order.id,
      amountKurus: 4_000,
      method: 'nakit',
      paidAt: '2026-09-11',
    });

    const summary = await getPeriodSummary(fresh.db, fresh.scope, '2026-09-01', '2026-09-30');

    expect(summary.collectedKurus).toBe(168_629);
    // Kalan 60,00 USD -> 2.529,44 TL
    expect(summary.outstandingKurus).toBe(421_573 - 168_629);

    await fresh.close();
  });
});
