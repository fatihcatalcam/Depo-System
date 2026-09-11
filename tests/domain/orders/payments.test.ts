import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
} from '@/domain/orders/orders';
import { addPayment, deletePayment, listPayments } from '@/domain/orders/payments';
import { makeBedSet, makeOrderCustomer } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

/** Notlardaki ornek: 50.000 TL'lik siparis. */
async function orderWorth(totalKurus: number, confirm = true) {
  const set = await makeBedSet(ctx.db, {
    model: `P${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    size: '160x200',
  });
  const customer = await makeOrderCustomer(ctx.db, ctx.scope);

  const order = await createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-08-08',
    deliveryAddress: 'Adres',
    lines: [
      { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: totalKurus },
    ],
  });
  if (confirm) await confirmOrder(ctx.db, ctx.scope, order.id);
  return order;
}

describe('addPayment', () => {
  it('notlardaki senaryo: 50.000 siparis, 40.000 pesinat, 10.000 kalan', async () => {
    const order = await orderWorth(5_000_000);

    const result = await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 4_000_000,
      method: 'havale',
      paidAt: '2026-08-08',
    });

    expect(result.paidKurus).toBe(4_000_000);
    expect(result.balanceKurus).toBe(1_000_000);
    expect(result.paymentStatus).toBe('partial');
  });

  it('kalan odenince durum odendi olur', async () => {
    const order = await orderWorth(5_000_000);
    await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 4_000_000,
      method: 'havale',
      paidAt: '2026-08-08',
    });
    const result = await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 1_000_000,
      method: 'nakit',
      paidAt: '2026-08-10',
    });

    expect(result.balanceKurus).toBe(0);
    expect(result.paymentStatus).toBe('paid');
  });

  it('fazla odemede bakiye negatif gorunur ve odendi sayilir', async () => {
    const order = await orderWorth(1_000_000);
    const result = await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 1_500_000,
      method: 'nakit',
      paidAt: '2026-08-08',
    });

    expect(result.balanceKurus).toBe(-500_000);
    expect(result.paymentStatus).toBe('paid');
  });

  it('kurus hassasiyeti korunur', async () => {
    const order = await orderWorth(10_000_50);
    await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 3_333_33,
      method: 'nakit',
      paidAt: '2026-08-08',
    });
    const result = await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 6_667_17,
      method: 'nakit',
      paidAt: '2026-08-08',
    });

    expect(result.paidKurus).toBe(10_000_50);
    expect(result.balanceKurus).toBe(0);
  });

  it('sifir veya negatif tutar reddedilir', async () => {
    const order = await orderWorth(1_000_000);
    await expect(
      addPayment(ctx.db, ctx.scope, {
        orderId: order.id,
        amountKurus: 0,
        method: 'nakit',
        paidAt: '2026-08-08',
      }),
    ).rejects.toThrow('Odeme tutari sifirdan buyuk olmali');
  });

  it('taslak siparise siradan odeme eklenemez', async () => {
    const order = await orderWorth(1_000_000, false);
    await expect(
      addPayment(ctx.db, ctx.scope, {
        orderId: order.id,
        amountKurus: 100_000,
        method: 'nakit',
        paidAt: '2026-08-08',
      }),
    ).rejects.toThrow('yalnizca kapora');
  });

  /**
   * Kapora istisnasi: musteri parayi siparisi verirken birakiyor, siparis o
   * anda henuz onaylanmamis oluyor. Yasak sonradan gelen tahsilatlar icin.
   */
  it('taslak siparise kapora eklenebilir', async () => {
    const order = await orderWorth(1_000_000, false);

    const result = await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 300_000,
      method: 'nakit',
      isDeposit: true,
      paidAt: '2026-08-08',
    });

    expect(result.paidKurus).toBe(300_000);
    expect(result.balanceKurus).toBe(700_000);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.depositKurus).toBe(300_000);
    expect(detail.status).toBe('draft');
  });

  it('kapora isareti odeme kaydinda kaliyor', async () => {
    const order = await orderWorth(1_000_000);
    await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 100_000,
      method: 'havale',
      isDeposit: true,
      paidAt: '2026-08-08',
    });
    await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 250_000,
      method: 'nakit',
      paidAt: '2026-08-09',
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    // Kapora odenenin bir parcasi, ayrica sayilan bir sey degil.
    expect(detail.paidKurus).toBe(350_000);
    expect(detail.depositKurus).toBe(100_000);
  });

  it('iptal edilmis siparise odeme eklenemez', async () => {
    const order = await orderWorth(1_000_000);
    await cancelOrder(ctx.db, ctx.scope, order.id);

    await expect(
      addPayment(ctx.db, ctx.scope, {
        orderId: order.id,
        amountKurus: 100_000,
        method: 'nakit',
        paidAt: '2026-08-08',
      }),
    ).rejects.toThrow('Iptal edilmis');
  });

  it('odeme yontemi kaydedilir', async () => {
    const order = await orderWorth(1_000_000);
    await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 500_000,
      method: 'cek',
      paidAt: '2026-08-08',
      notes: 'Vadeli cek',
    });

    const list = await listPayments(ctx.db, ctx.scope, order.id);
    expect(list[0].method).toBe('cek');
    expect(list[0].notes).toBe('Vadeli cek');
  });
});

describe('siparis detayinda ve listesinde bakiye', () => {
  it('getOrder odenen ve kalani doner', async () => {
    const order = await orderWorth(5_000_000);
    await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 2_000_000,
      method: 'kart',
      paidAt: '2026-08-08',
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.paidKurus).toBe(2_000_000);
    expect(detail.balanceKurus).toBe(3_000_000);
    expect(detail.paymentStatus).toBe('partial');
  });

  it('listOrders bakiyeyi tek sorguda hesaplar', async () => {
    const order = await orderWorth(4_000_000);
    await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 4_000_000,
      method: 'nakit',
      paidAt: '2026-08-08',
    });

    const summary = (await listOrders(ctx.db, ctx.scope)).find((o) => o.id === order.id);
    expect(summary?.paidKurus).toBe(4_000_000);
    expect(summary?.balanceKurus).toBe(0);
    expect(summary?.paymentStatus).toBe('paid');
  });
});

describe('deletePayment', () => {
  it('yanlis girilen odeme silinebilir ve bakiye geri doner', async () => {
    const order = await orderWorth(2_000_000);
    const result = await addPayment(ctx.db, ctx.scope, {
      orderId: order.id,
      amountKurus: 2_000_000,
      method: 'nakit',
      paidAt: '2026-08-08',
    });

    await deletePayment(ctx.db, ctx.scope, result.payment.id);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.paidKurus).toBe(0);
    expect(detail.paymentStatus).toBe('unpaid');
  });

  it('olmayan odeme silinemez', async () => {
    await expect(
      deletePayment(ctx.db, ctx.scope, '99999999-1111-2222-3333-444444444444'),
    ).rejects.toThrow('bulunamadi');
  });
});
