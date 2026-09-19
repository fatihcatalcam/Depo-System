import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { orderStatusEnum } from '@/db/schema';
import { orderLineComponents, orderLines, orders } from '@/db/schema';
import { getAvailability, getReservedQuantities } from '@/domain/stock/availability';
import { applyMovements } from '@/domain/stock/movements';
import { makeCustomer, makeStockItem } from '../../helpers/factories';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

type OrderStatus = (typeof orderStatusEnum.enumValues)[number];

let sequence = 0;

/** Belirtilen durumda, verilen stok kartindan `total` adet rezerve eden bir siparis kurar. */
async function makeOrderReserving(
  stockItemId: string,
  total: number,
  status: OrderStatus,
  delivered = 0,
) {
  const customer = await makeCustomer(ctx.db);
  const [order] = await ctx.db
    .insert(orders)
    .values({
      orderNo: `SP-2026-${(++sequence).toString().padStart(5, '0')}`,
      branchId: ctx.branchId,
      customerId: customer.id,
      orderDate: '2026-08-08',
      deliveryAddress: 'Test adres',
      status,
    })
    .returning();
  const [line] = await ctx.db
    .insert(orderLines)
    .values({
      orderId: order.id,
      lineNo: 1,
      itemType: 'stock_item',
      stockItemId,
      description: 'Test',
      quantity: total,
    })
    .returning();
  await ctx.db.insert(orderLineComponents).values({
    orderLineId: line.id,
    stockItemId,
    quantityPerUnit: 1,
    totalQuantity: total,
    deliveredQuantity: delivered,
  });
  return order;
}

describe('getAvailability', () => {
  it('siparis yokken serbest stok mevcuda esittir', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 12, movementType: 'goods_receipt' },
    ]);

    expect(await getAvailability(ctx.db, ctx.branchId, item.id)).toEqual({
      onHand: 12,
      reserved: 0,
      available: 12,
    });
  });

  it('onaylanmis siparis stogu rezerve eder', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 12, movementType: 'goods_receipt' },
    ]);
    await makeOrderReserving(item.id, 5, 'confirmed');

    expect(await getAvailability(ctx.db, ctx.branchId, item.id)).toEqual({
      onHand: 12,
      reserved: 5,
      available: 7,
    });
  });

  it('taslak siparis rezervasyon yaratmaz', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 12, movementType: 'goods_receipt' },
    ]);
    await makeOrderReserving(item.id, 5, 'draft');

    expect((await getAvailability(ctx.db, ctx.branchId, item.id)).reserved).toBe(0);
  });

  it('iptal ve teslim edilmis siparisler rezervasyon yaratmaz', async () => {
    const item = await makeStockItem(ctx.db);
    await makeOrderReserving(item.id, 3, 'cancelled');
    await makeOrderReserving(item.id, 4, 'delivered', 4);

    expect((await getAvailability(ctx.db, ctx.branchId, item.id)).reserved).toBe(0);
  });

  it('kismen teslim edilen sipariste sadece kalan miktar rezervedir', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 20, movementType: 'goods_receipt' },
    ]);
    await makeOrderReserving(item.id, 10, 'partially_delivered', 6);

    expect(await getAvailability(ctx.db, ctx.branchId, item.id)).toEqual({
      onHand: 20,
      reserved: 4,
      available: 16,
    });
  });

  it('rezervasyon mevcudu asarsa serbest stok negatif gorunur', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 2, movementType: 'goods_receipt' },
    ]);
    await makeOrderReserving(item.id, 9, 'confirmed');

    expect(await getAvailability(ctx.db, ctx.branchId, item.id)).toEqual({
      onHand: 2,
      reserved: 9,
      available: -7,
    });
  });

  it('olmayan stok karti icin hata firlatir', async () => {
    await expect(
      getAvailability(ctx.db, ctx.branchId, '33333333-3333-3333-3333-333333333333'),
    ).rejects.toThrow('bulunamadi');
  });
});

describe('getReservedQuantities', () => {
  it('birden fazla stok kartinin rezervesini tek sorguda doner', async () => {
    const a = await makeStockItem(ctx.db);
    const b = await makeStockItem(ctx.db);
    const c = await makeStockItem(ctx.db);
    await makeOrderReserving(a.id, 3, 'confirmed');
    await makeOrderReserving(b.id, 7, 'partially_delivered', 2);

    const map = await getReservedQuantities(ctx.db, ctx.branchId, [a.id, b.id, c.id]);

    expect(map.get(a.id)).toBe(3);
    expect(map.get(b.id)).toBe(5);
    expect(map.get(c.id) ?? 0).toBe(0);
  });

  it('bos liste icin sorgu calistirmadan bos harita doner', async () => {
    expect((await getReservedQuantities(ctx.db, ctx.branchId, [])).size).toBe(0);
  });
});
