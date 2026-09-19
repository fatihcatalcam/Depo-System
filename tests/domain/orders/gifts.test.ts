import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStockItem } from '@/domain/catalog/stock-items';
import { confirmOrder, createOrder, getOrder, updateOrder } from '@/domain/orders/orders';
import { createCustomer } from '@/domain/parties/parties';
import { getDailyShipment } from '@/domain/shipments';
import { getAvailability } from '@/domain/stock/availability';
import { applyMovements } from '@/domain/stock/movements';
import { makeBedSet } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;
let sequence = 0;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

/**
 * Bir yatak seti (satilan) ve bir alez (hediye edilen) iceren siparis kurar —
 * musterinin anlattigi gercek senaryo.
 */
async function orderWithGift(options: { giftQuantity?: number } = {}) {
  const tag = `HED${(++sequence).toString().padStart(3, '0')}`;
  const set = await makeBedSet(ctx.db, ctx.branchId, { model: tag, size: '160x200', stock: 10 });
  const { alez } = await makeGiftItem(tag);
  const customer = await createCustomer(ctx.db, ctx.scope, { name: `Musteri ${tag}` });

  const order = await createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-08-10',
    plannedDeliveryDate: '2026-08-12',
    deliveryAddress: 'Ornek Mah. 1. Sok.',
    lines: [
      { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 5_000_000 },
      {
        itemType: 'stock_item',
        stockItemId: alez.id,
        quantity: options.giftQuantity ?? 1,
        unitPriceKurus: 85_000,
        isGift: true,
      },
    ],
  });

  return { order, set, alez, customer };
}

/** Hediye edilebilen tipik urun: alez. */
async function makeGiftItem(tag: string) {
  const alez = await createStockItem(ctx.db, { name: `${tag} ALEZ`, sizeLabel: '160x200' });
  await applyMovements(ctx.db, ctx.branchId, [
    { stockItemId: alez.id, quantityChange: 10, movementType: 'goods_receipt' },
  ]);
  return { alez };
}

describe('hediye satir', () => {
  it('musteriden para alinmaz: satir toplami sifir, ara toplama girmez', async () => {
    const { order } = await orderWithGift();

    expect(order.subtotalKurus).toBe(5_000_000);
    expect(order.totalKurus).toBe(5_000_000);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    const gift = detail.lines.find((line) => line.isGift);
    expect(gift?.lineTotalKurus).toBe(0);
  });

  /**
   * Hediyenin fiyata 0 yazmaktan farki bu: verilen urunun degeri kayitli
   * kaliyor, "bu ay ne kadar hediye verdik" sorusu cevaplanabiliyor.
   */
  it('verilen urunun degeri kaydedilir', async () => {
    const { order } = await orderWithGift({ giftQuantity: 2 });
    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    const gift = detail.lines.find((line) => line.isGift);

    expect(gift?.unitPriceKurus).toBe(85_000);
    expect(gift?.quantity).toBe(2);
    expect(gift?.lineTotalKurus).toBe(0);
  });

  /**
   * En kritik davranis. Hediye olmasi bedava olmasi demek, yok sayilmasi
   * degil: mal depodan cikiyor. Stoktan dusmezse depo rakamlari yalan soyler.
   */
  it('hediye urun stoktan duser', async () => {
    const { order, alez } = await orderWithGift({ giftQuantity: 3 });

    const beforeConfirm = await getAvailability(ctx.db, ctx.branchId, alez.id);
    expect(beforeConfirm.reserved).toBe(0);

    await confirmOrder(ctx.db, ctx.scope, order.id);

    const afterConfirm = await getAvailability(ctx.db, ctx.branchId, alez.id);
    expect(afterConfirm.reserved).toBe(3);
    expect(afterConfirm.available).toBe(7);
  });

  /**
   * Ikinci kritik davranis: toplama listesinde gorunmezse depocu yatagi
   * yukler, alezi unutur ve musteri eksik mal alir.
   */
  it('hediye urun toplama listesinde ve sofor kagidinda gorunur', async () => {
    const { order, alez } = await orderWithGift({ giftQuantity: 2 });
    await confirmOrder(ctx.db, ctx.scope, order.id);

    const shipment = await getDailyShipment(ctx.db, ctx.scope, '2026-08-12');
    const picking = shipment.pickingList.find((item) => item.stockItemId === alez.id);

    expect(picking?.quantity).toBe(2);

    const stop = shipment.stops.find((entry) => entry.orderId === order.id);
    expect(stop?.items.some((item) => item.stockItemId === alez.id)).toBe(true);
  });

  it('hediye isareti kaldirilinca satir yeniden ucretlenir', async () => {
    const { order, set, alez } = await orderWithGift();

    await updateOrder(ctx.db, ctx.scope, order.id, {
      lines: [
        { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 5_000_000 },
        { itemType: 'stock_item', stockItemId: alez.id, quantity: 1, unitPriceKurus: 85_000 },
      ],
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.subtotalKurus).toBe(5_085_000);
    expect(detail.lines.every((line) => line.isGift === false)).toBe(true);
  });

  it('iskonto hediyesiz ara toplamla sinirlanir', async () => {
    const { order } = await orderWithGift();

    // Ara toplam 5.000.000; hediyenin 85.000'i buna dahil degil.
    await expect(
      updateOrder(ctx.db, ctx.scope, order.id, { discountKurus: 5_085_000 }),
    ).rejects.toThrow('Iskonto ara toplamdan buyuk olamaz');

    await updateOrder(ctx.db, ctx.scope, order.id, { discountKurus: 5_000_000 });
    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.totalKurus).toBe(0);
  });

  it('tamamen hediye siparis kurulabilir', async () => {
    const tag = `TAMHED${++sequence}`;
    const { alez } = await makeGiftItem(tag);
    const customer = await createCustomer(ctx.db, ctx.scope, { name: `Musteri ${tag}` });

    const order = await createOrder(ctx.db, ctx.scope, {
      customerId: customer.id,
      orderDate: '2026-08-10',
      deliveryAddress: 'Adres',
      lines: [
        {
          itemType: 'stock_item',
          stockItemId: alez.id,
          quantity: 1,
          unitPriceKurus: 85_000,
          isGift: true,
        },
      ],
    });

    expect(order.subtotalKurus).toBe(0);
    expect(order.totalKurus).toBe(0);

    // Bedelsiz de olsa mal cikiyor.
    await confirmOrder(ctx.db, ctx.scope, order.id);
    expect((await getAvailability(ctx.db, ctx.branchId, alez.id)).reserved).toBe(1);
  });
});
