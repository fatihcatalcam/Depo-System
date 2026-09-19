import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stockMovements } from '@/db/schema';
import { adjustStockCount } from '@/domain/stock/counting';
import { applyMovements } from '@/domain/stock/movements';
import { makeStockItem } from '../../helpers/factories';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

async function movementsOf(stockItemId: string) {
  return ctx.db.select().from(stockMovements).where(eq(stockMovements.stockItemId, stockItemId));
}

describe('adjustStockCount', () => {
  it('sayilan adet fazlaysa artis hareketi olusturur', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 10, movementType: 'goods_receipt' },
    ]);

    const result = await adjustStockCount(ctx.db, ctx.branchId, { stockItemId: item.id, countedQuantity: 13 });

    expect(result).toEqual({ previous: 10, counted: 13, difference: 3 });
    const adjustment = (await movementsOf(item.id)).find((r) => r.movementType === 'stock_count');
    expect(adjustment?.quantityChange).toBe(3);
    expect(adjustment?.balanceAfter).toBe(13);
  });

  it('sayilan adet azsa azalis hareketi olusturur', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 10, movementType: 'goods_receipt' },
    ]);

    const result = await adjustStockCount(ctx.db, ctx.branchId, { stockItemId: item.id, countedQuantity: 4 });

    expect(result.difference).toBe(-6);
    const adjustment = (await movementsOf(item.id)).find((r) => r.movementType === 'stock_count');
    expect(adjustment?.balanceAfter).toBe(4);
  });

  it('fark yoksa hareket olusturmaz', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 7, movementType: 'goods_receipt' },
    ]);

    const result = await adjustStockCount(ctx.db, ctx.branchId, { stockItemId: item.id, countedQuantity: 7 });

    expect(result.difference).toBe(0);
    expect(
      (await movementsOf(item.id)).filter((r) => r.movementType === 'stock_count'),
    ).toHaveLength(0);
  });

  it('negatif sayim reddedilir', async () => {
    const item = await makeStockItem(ctx.db);
    await expect(
      adjustStockCount(ctx.db, ctx.branchId, { stockItemId: item.id, countedQuantity: -1 }),
    ).rejects.toThrow('Sayilan adet negatif olamaz');
  });

  it('not hareket kaydina yazilir', async () => {
    const item = await makeStockItem(ctx.db);
    await adjustStockCount(ctx.db, ctx.branchId, {
      stockItemId: item.id,
      countedQuantity: 5,
      notes: 'Yil sonu sayimi',
    });

    const adjustment = (await movementsOf(item.id)).find((r) => r.movementType === 'stock_count');
    expect(adjustment?.notes).toBe('Yil sonu sayimi');
  });

  it('olmayan stok karti icin hata firlatir', async () => {
    await expect(
      adjustStockCount(ctx.db, ctx.branchId, {
        stockItemId: '44444444-4444-4444-4444-444444444444',
        countedQuantity: 5,
      }),
    ).rejects.toThrow('bulunamadi');
  });
});
