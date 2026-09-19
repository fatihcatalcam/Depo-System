import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStockItem } from '@/domain/catalog/stock-items';
import { createDelivery } from '@/domain/orders/deliveries';
import { cancelOrder, confirmOrder, createOrder, getOrder } from '@/domain/orders/orders';
import { addPayment } from '@/domain/orders/payments';
import { getPeriodSummary, periodRange } from '@/domain/reports';
import { applyMovements } from '@/domain/stock/movements';
import { makeBedSet, makeOrderCustomer } from '../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../helpers/test-db';

describe('periodRange', () => {
  it('gunluk donem tek gundur', () => {
    expect(periodRange('gun', '2026-08-12')).toEqual({ from: '2026-08-12', to: '2026-08-12' });
  });

  it('haftalik donem pazartesi baslar pazar biter', () => {
    // 2026-08-12 carsamba
    expect(periodRange('hafta', '2026-08-12')).toEqual({
      from: '2026-08-10',
      to: '2026-08-16',
    });
  });

  it('pazar gunu icinde bulundugu haftaya ait sayilir', () => {
    // 2026-08-16 pazar
    expect(periodRange('hafta', '2026-08-16')).toEqual({
      from: '2026-08-10',
      to: '2026-08-16',
    });
  });

  it('aylik donem ayin ilk ve son gunudur', () => {
    expect(periodRange('ay', '2026-08-12')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('subat gibi kisa aylarda dogru biter', () => {
    expect(periodRange('ay', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('getPeriodSummary', () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('bos donemde sifirlar doner', async () => {
    const summary = await getPeriodSummary(ctx.db, ctx.scope, '2030-01-01', '2030-01-31');
    expect(summary.orderCount).toBe(0);
    expect(summary.revenueKurus).toBe(0);
    expect(summary.collectedKurus).toBe(0);
  });

  it('siparis sayisi, ciro, tahsilat ve teslimat sayisini hesaplar', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.branchId, { model: 'RAPOR', size: '160x200', stock: 20 });
    const customer = await makeOrderCustomer(fresh.db, fresh.scope);

    const order = await createOrder(fresh.db, fresh.scope, {
      customerId: customer.id,
      orderDate: '2026-08-12',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 2, unitPriceKurus: 3_000_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scope, order.id);
    await addPayment(fresh.db, fresh.scope, {
      orderId: order.id,
      amountKurus: 2_000_000,
      method: 'nakit',
      paidAt: '2026-08-12',
    });

    const detail = await getOrder(fresh.db, fresh.scope, order.id);
    await createDelivery(fresh.db, fresh.scope, {
      orderId: order.id,
      deliveredAt: new Date('2026-08-12T10:00:00Z'),
      lines: [{ orderLineComponentId: detail.lines[0].components[0].id, quantity: 1 }],
    });

    const summary = await getPeriodSummary(fresh.db, fresh.scope, '2026-08-01', '2026-08-31');

    expect(summary.orderCount).toBe(1);
    expect(summary.revenueKurus).toBe(6_000_000);
    expect(summary.collectedKurus).toBe(2_000_000);
    expect(summary.deliveryCount).toBe(1);
    expect(summary.outstandingKurus).toBe(4_000_000);

    await fresh.close();
  });

  it('iptal edilen siparis ciroya girmez', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.branchId, { model: 'IPTALRAPOR', size: '160x200' });
    const customer = await makeOrderCustomer(fresh.db, fresh.scope);

    const order = await createOrder(fresh.db, fresh.scope, {
      customerId: customer.id,
      orderDate: '2026-08-12',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 9_000_000 },
      ],
    });
    await cancelOrder(fresh.db, fresh.scope, order.id);

    const summary = await getPeriodSummary(fresh.db, fresh.scope, '2026-08-01', '2026-08-31');
    expect(summary.orderCount).toBe(0);
    expect(summary.revenueKurus).toBe(0);

    await fresh.close();
  });

  it('donem disindaki tahsilat sayilmaz', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.branchId, { model: 'DONEMDISI', size: '160x200' });
    const customer = await makeOrderCustomer(fresh.db, fresh.scope);

    const order = await createOrder(fresh.db, fresh.scope, {
      customerId: customer.id,
      orderDate: '2026-08-12',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 1_000_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scope, order.id);
    await addPayment(fresh.db, fresh.scope, {
      orderId: order.id,
      amountKurus: 1_000_000,
      method: 'nakit',
      paidAt: '2026-09-05',
    });

    const august = await getPeriodSummary(fresh.db, fresh.scope, '2026-08-01', '2026-08-31');
    const september = await getPeriodSummary(fresh.db, fresh.scope, '2026-09-01', '2026-09-30');

    expect(august.collectedKurus).toBe(0);
    expect(september.collectedKurus).toBe(1_000_000);

    await fresh.close();
  });

  it('fazla odenmis siparis baska siparisin alacagini goturmez', async () => {
    const fresh = await createTestDb();
    const set = await makeBedSet(fresh.db, fresh.branchId, { model: 'FAZLAODEME', size: '160x200', stock: 30 });
    const customer = await makeOrderCustomer(fresh.db, fresh.scope);

    // 1.000.000 tutarli siparise 1.500.000 odendi (bakiye -500.000)
    const overpaid = await createOrder(fresh.db, fresh.scope, {
      customerId: customer.id,
      orderDate: '2026-08-12',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 1_000_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scope, overpaid.id);
    await addPayment(fresh.db, fresh.scope, {
      orderId: overpaid.id,
      amountKurus: 1_500_000,
      method: 'nakit',
      paidAt: '2026-08-12',
    });

    // 2.000.000 tutarli, hic odenmemis ikinci siparis
    const unpaid = await createOrder(fresh.db, fresh.scope, {
      customerId: customer.id,
      orderDate: '2026-08-12',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 2_000_000 },
      ],
    });
    await confirmOrder(fresh.db, fresh.scope, unpaid.id);

    const summary = await getPeriodSummary(fresh.db, fresh.scope, '2026-08-01', '2026-08-31');

    // Naif toplama 2.000.000 - 500.000 = 1.500.000 verirdi; dogrusu 2.000.000.
    expect(summary.outstandingKurus).toBe(2_000_000);

    await fresh.close();
  });

  it('en cok satan urunleri siralar', async () => {
    const fresh = await createTestDb();
    const az = await makeBedSet(fresh.db, fresh.branchId, { model: 'AZSATAN', size: '160x200', stock: 30 });
    const cok = await makeBedSet(fresh.db, fresh.branchId, { model: 'COKSATAN', size: '160x200', stock: 30 });
    const customer = await makeOrderCustomer(fresh.db, fresh.scope);

    await createOrder(fresh.db, fresh.scope, {
      customerId: customer.id,
      orderDate: '2026-08-12',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: az.product.id, quantity: 1, unitPriceKurus: 100_000 },
        { itemType: 'product', productId: cok.product.id, quantity: 7, unitPriceKurus: 200_000 },
      ],
    });

    const summary = await getPeriodSummary(fresh.db, fresh.scope, '2026-08-01', '2026-08-31');

    expect(summary.topProducts[0].description).toContain('COKSATAN');
    expect(summary.topProducts[0].quantity).toBe(7);
    expect(summary.topProducts[0].revenueKurus).toBe(1_400_000);

    await fresh.close();
  });

  it('stok degeri alis fiyatina gore hesaplanir', async () => {
    const fresh = await createTestDb();
    const item = await createStockItem(fresh.db, {
      name: 'DEGERLI PARCA',
      purchasePriceKurus: 150_000,
    });
    await createStockItem(fresh.db, { name: 'FIYATSIZ PARCA' });
    await applyMovements(fresh.db, fresh.branchId, [
      { stockItemId: item.id, quantityChange: 4, movementType: 'goods_receipt' },
    ]);

    const summary = await getPeriodSummary(fresh.db, fresh.scope, '2026-08-01', '2026-08-31');
    expect(summary.stockValueKurus).toBe(600_000);

    await fresh.close();
  });
});
