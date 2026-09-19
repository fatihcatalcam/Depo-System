import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDelivery, deliverRemaining } from '@/domain/orders/deliveries';
import { confirmOrder, createOrder, getOrder } from '@/domain/orders/orders';
import { getPendingOverview } from '@/domain/orders/pending';
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

async function confirmedOrder(options: { quantity?: number; stock?: number } = {}) {
  const tag = `BK${(++sequence).toString().padStart(3, '0')}`;
  const set = await makeBedSet(ctx.db, ctx.branchId, {
    model: tag,
    size: '160x200',
    stock: options.stock ?? 10,
  });
  const customer = await makeOrderCustomer(ctx.db, ctx.scope);

  const order = await createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-09-10',
    plannedDeliveryDate: '2026-09-15',
    deliveryAddress: 'Adres',
    lines: [
      {
        itemType: 'product',
        productId: set.product.id,
        quantity: options.quantity ?? 1,
        unitPriceKurus: 1_000_000,
      },
    ],
  });
  await confirmOrder(ctx.db, ctx.scope, order.id);
  return { order, set, customer };
}

describe('bekleyen urunler', () => {
  it('taslak siparis bekleyen sayilmaz', async () => {
    const tag = `BKT${(++sequence).toString().padStart(3, '0')}`;
    const set = await makeBedSet(ctx.db, ctx.branchId, { model: tag, size: '160x200' });
    const customer = await makeOrderCustomer(ctx.db, ctx.scope);
    const order = await createOrder(ctx.db, ctx.scope, {
      customerId: customer.id,
      orderDate: '2026-09-10',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 100 },
      ],
    });

    const overview = await getPendingOverview(ctx.db, ctx.scope);
    expect(overview.orders.some((row) => row.orderId === order.id)).toBe(false);
  });

  it('onaylanan siparisin parcalari musteri altinda listelenir', async () => {
    const { order, customer } = await confirmedOrder({ quantity: 2 });

    const overview = await getPendingOverview(ctx.db, ctx.scope);
    const row = overview.orders.find((entry) => entry.orderId === order.id);

    expect(row).toBeDefined();
    expect(row?.customerName).toBe(customer.name);
    // Set uc parcali, iki adet siparis: 6 parca bekliyor.
    expect(row?.pendingPieces).toBe(6);
    expect(row?.items).toHaveLength(3);
  });

  it('teslim edilen parca bekleyenden duser', async () => {
    const { order } = await confirmedOrder({ quantity: 2 });
    const detail = await getOrder(ctx.db, ctx.scope, order.id);

    await createDelivery(ctx.db, ctx.scope, {
      orderId: order.id,
      lines: [{ orderLineComponentId: detail.lines[0].components[0].id, quantity: 2 }],
    });

    const overview = await getPendingOverview(ctx.db, ctx.scope);
    const row = overview.orders.find((entry) => entry.orderId === order.id);
    expect(row?.pendingPieces).toBe(4);
    expect(row?.items).toHaveLength(2);
  });

  it('tamamen teslim edilen siparis listeden cikar', async () => {
    const { order } = await confirmedOrder();
    await deliverRemaining(ctx.db, ctx.scope, order.id);

    const overview = await getPendingOverview(ctx.db, ctx.scope);
    expect(overview.orders.some((row) => row.orderId === order.id)).toBe(false);
  });

  /** Toplu dokum uretim listesi olarak okunuyor: ne kadar borcluyuz. */
  it('ayni parcayi bekleyen iki siparis toplu dokumde birlesir', async () => {
    const tag = `BKS${(++sequence).toString().padStart(3, '0')}`;
    const set = await makeBedSet(ctx.db, ctx.branchId, { model: tag, size: '160x200', stock: 100 });

    for (const quantity of [2, 3]) {
      const customer = await makeOrderCustomer(ctx.db, ctx.scope);
      const order = await createOrder(ctx.db, ctx.scope, {
        customerId: customer.id,
        orderDate: '2026-09-10',
        deliveryAddress: 'Adres',
        lines: [
          { itemType: 'product', productId: set.product.id, quantity, unitPriceKurus: 100 },
        ],
      });
      await confirmOrder(ctx.db, ctx.scope, order.id);
    }

    const overview = await getPendingOverview(ctx.db, ctx.scope);
    const yatak = overview.totals.find((item) => item.stockItemId === set.yatak.id);
    expect(yatak?.quantity).toBe(5);
    expect(yatak?.shortage).toBe(0);
  });

  it('depodaki adet yetmiyorsa eksik hesaplanir', async () => {
    const { set } = await confirmedOrder({ quantity: 7, stock: 4 });

    const overview = await getPendingOverview(ctx.db, ctx.scope);
    const yatak = overview.totals.find((item) => item.stockItemId === set.yatak.id);

    expect(yatak?.quantity).toBe(7);
    expect(yatak?.onHand).toBe(4);
    expect(yatak?.shortage).toBe(3);
  });

  /** Serbest satirin stok karti yok; "eksik" demek anlamsiz olurdu. */
  it('serbest satir listede gorunur ama eksik hesaplanmaz', async () => {
    const tag = `BKC${(++sequence).toString().padStart(3, '0')}`;
    const set = await makeBedSet(ctx.db, ctx.branchId, { model: tag, size: '160x200' });
    const customer = await makeOrderCustomer(ctx.db, ctx.scope);
    const order = await createOrder(ctx.db, ctx.scope, {
      customerId: customer.id,
      orderDate: '2026-09-10',
      deliveryAddress: 'Adres',
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 100 },
        { itemType: 'custom', description: 'Ozel olcu ceviz sehpa', quantity: 2, unitPriceKurus: 0 },
      ],
    });
    await confirmOrder(ctx.db, ctx.scope, order.id);

    const overview = await getPendingOverview(ctx.db, ctx.scope);
    const custom = overview.totals.find((item) => item.stockItemName === 'Ozel olcu ceviz sehpa');

    expect(custom?.quantity).toBe(2);
    expect(custom?.stockItemId).toBeNull();
    expect(custom?.onHand).toBeNull();
    expect(custom?.shortage).toBe(0);
  });

  it('diger subenin bekleyen siparisi gorunmez', async () => {
    const { order } = await confirmedOrder();

    const overview = await getPendingOverview(ctx.db, ctx.scopes.s2);
    expect(overview.orders.some((row) => row.orderId === order.id)).toBe(false);
  });
});

describe('deliverRemaining', () => {
  it('kalan her seyi teslim eder ve stoktan duser', async () => {
    const { order, set } = await confirmedOrder({ quantity: 2, stock: 10 });

    await deliverRemaining(ctx.db, ctx.scope, order.id);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.status).toBe('delivered');
    expect(detail.lines[0].components.every((c) => c.remainingQuantity === 0)).toBe(true);

    const { listStockItemsWithAvailability } = await import('@/domain/catalog/stock-items');
    const items = await listStockItemsWithAvailability(ctx.db, ctx.branchId, {});
    const yatak = items.find((item) => item.id === set.yatak.id);
    expect(yatak?.onHand).toBe(8);
  });

  it('kismi teslimattan sonra yalnizca kalani teslim eder', async () => {
    const { order, set } = await confirmedOrder({ quantity: 3, stock: 10 });
    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    const yatakComponent = detail.lines[0].components.find(
      (component) => component.stockItemId === set.yatak.id,
    );

    await createDelivery(ctx.db, ctx.scope, {
      orderId: order.id,
      lines: [{ orderLineComponentId: yatakComponent!.id, quantity: 1 }],
    });

    await deliverRemaining(ctx.db, ctx.scope, order.id);

    const after = await getOrder(ctx.db, ctx.scope, order.id);
    expect(after.status).toBe('delivered');
    const { listStockItemsWithAvailability } = await import('@/domain/catalog/stock-items');
    const items = await listStockItemsWithAvailability(ctx.db, ctx.branchId, {});
    // Ucu de cikti, iki kere degil.
    expect(items.find((item) => item.id === set.yatak.id)?.onHand).toBe(7);
  });

  it('teslim edilecek parca kalmayinca hata verir', async () => {
    const { order } = await confirmedOrder();
    await deliverRemaining(ctx.db, ctx.scope, order.id);

    await expect(deliverRemaining(ctx.db, ctx.scope, order.id)).rejects.toThrow(
      'teslim edilecek parca kalmadi',
    );
  });

  /** Stok yetmiyorsa sessizce eksiye dusmemeli; kullaniciya sorulacak. */
  it('stok yetmiyorsa reddeder, acik onayla gecer', async () => {
    const { order } = await confirmedOrder({ quantity: 5, stock: 2 });

    await expect(deliverRemaining(ctx.db, ctx.scope, order.id)).rejects.toThrow();

    const delivery = await deliverRemaining(ctx.db, ctx.scope, order.id, {
      allowNegativeStock: true,
    });
    expect(delivery.id).toBeTruthy();

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.status).toBe('delivered');
  });

  it('diger subenin siparisi teslim edilemez', async () => {
    const { order } = await confirmedOrder();

    await expect(deliverRemaining(ctx.db, ctx.scopes.s2, order.id)).rejects.toThrow();
  });
});
