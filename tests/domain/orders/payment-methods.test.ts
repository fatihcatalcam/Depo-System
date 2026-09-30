import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { payments } from '@/db/schema';
import { paymentMethodEnum } from '@/db/schema/enums';
import { confirmOrder, createOrder, getOrder } from '@/domain/orders/orders';
import { addPayment, listPayments } from '@/domain/orders/payments';
import {
  formatPaymentMethod,
  PAYMENT_METHODS,
  resolveInstallments,
} from '@/lib/payment-methods';
import { makeBedSet, makeOrderCustomer } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;
let productId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const set = await makeBedSet(ctx.db, ctx.warehouseId, { model: 'ODEME', size: '160x200' });
  productId = set.product.id;
});

afterAll(async () => {
  await ctx.close();
});

/** 1.000,00 TL'lik taslak siparis. */
async function newOrder(deposits: Parameters<typeof createOrder>[2]['deposits'] = []) {
  const customer = await makeOrderCustomer(ctx.db, ctx.scope);
  return createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-09-10',
    deliveryAddress: 'Adres',
    deposits,
    lines: [{ itemType: 'product', productId, quantity: 1, unitPriceKurus: 100_000 }],
  });
}

describe('odeme yontemleri', () => {
  /**
   * Ekrandaki liste istemci tarafinda, veritabani enum'u semada. Biri
   * digerinden eksik kalirsa ya secilen yontem kaydedilemez ya da kayitli
   * bir odemenin etiketi bos gorunur.
   */
  it('ekrandaki liste veritabani enum ile ayni', () => {
    expect([...PAYMENT_METHODS].sort()).toEqual([...paymentMethodEnum.enumValues].sort());
  });

  it('kart (portal) ile odeme alinir', async () => {
    const order = await newOrder();
    await confirmOrder(ctx.db, ctx.scope, order.id);
    await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 10_000,
      method: 'kart_portal',
      paidAt: '2026-09-11',
    });

    const [payment] = await listPayments(ctx.db, ctx.scope, order.id);
    expect(payment.method).toBe('kart_portal');
    expect(formatPaymentMethod(payment.method, payment.installments)).toBe('Kart (portal)');
  });
});

describe('taksit', () => {
  it('kartla 6 taksit kaydedilir', async () => {
    const order = await newOrder();
    await confirmOrder(ctx.db, ctx.scope, order.id);
    await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 10_000,
      method: 'kart',
      installments: 6,
      paidAt: '2026-09-11',
    });

    const [payment] = await listPayments(ctx.db, ctx.scope, order.id);
    expect(payment.installments).toBe(6);
    expect(formatPaymentMethod(payment.method, payment.installments)).toBe(
      'Kredi karti · 6 taksit',
    );
  });

  it('1 taksit tek cekim sayilir ve bos saklanir', () => {
    expect(resolveInstallments('kart', 1)).toBeNull();
    expect(resolveInstallments('kart', null)).toBeNull();
    expect(resolveInstallments('nakit', undefined)).toBeNull();
  });

  it('nakitte taksit olmaz', () => {
    expect(() => resolveInstallments('nakit', 3)).toThrow('taksit yalnizca kartla');
  });

  it('9 taksitten fazlasi olmaz', () => {
    expect(() => resolveInstallments('kart', 10)).toThrow('1 ile 9 arasinda');
    expect(resolveInstallments('kart_portal', 9)).toBe(9);
  });

  /** Alan katmani atlansa bile veritabani yanlis veriyi kabul etmiyor. */
  it('veritabani nakde taksit yazdirmiyor', async () => {
    const order = await newOrder([{ amountKurus: 10_000, method: 'nakit' }]);
    const [payment] = await listPayments(ctx.db, ctx.scope, order.id);

    await expect(
      ctx.db.update(payments).set({ installments: 3 }).where(eq(payments.id, payment.id)),
    ).rejects.toThrow();
  });
});

describe('siparis verilirken birden fazla odeme', () => {
  it('nakit + kart birlikte kapora olarak kaydedilir', async () => {
    const order = await newOrder([
      { amountKurus: 30_000, method: 'nakit' },
      { amountKurus: 50_000, method: 'kart', installments: 3 },
    ]);

    const list = await listPayments(ctx.db, ctx.scope, order.id);
    expect(list).toHaveLength(2);
    expect(list.every((payment) => payment.isDeposit)).toBe(true);
    expect(list.map((payment) => [payment.method, payment.installments]).sort()).toEqual([
      ['kart', 3],
      ['nakit', null],
    ]);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.paidKurus).toBe(80_000);
    expect(detail.balanceKurus).toBe(20_000);
  });

  /**
   * Tek tek bakilsa ikisi de siparis tutarinin altinda; birlikte asiyor.
   * Kontrol toplam uzerinden olmali.
   */
  it('toplami siparis tutarini asamaz', async () => {
    await expect(
      newOrder([
        { amountKurus: 60_000, method: 'nakit' },
        { amountKurus: 60_000, method: 'kart' },
      ]),
    ).rejects.toThrow('siparis tutarindan buyuk olamaz');
  });

  it('bos tutarli satirlar yok sayilir', async () => {
    const order = await newOrder([
      { amountKurus: 20_000, method: 'nakit' },
      { amountKurus: 0, method: 'kart' },
    ]);
    expect(await listPayments(ctx.db, ctx.scope, order.id)).toHaveLength(1);
  });

  /** Hata olursa siparis de, odemeler de yazilmamali. */
  it('hatali taksit siparisi de geri alir', async () => {
    const before = await ctx.db.select().from(payments);
    await expect(
      newOrder([
        { amountKurus: 20_000, method: 'nakit' },
        { amountKurus: 20_000, method: 'havale', installments: 4 },
      ]),
    ).rejects.toThrow('taksit yalnizca kartla');
    expect(await ctx.db.select().from(payments)).toHaveLength(before.length);
  });
});
