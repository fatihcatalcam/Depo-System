import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStockItem } from '@/domain/catalog/stock-items';
import { listStockHistory } from '@/domain/stock/history';
import { applyMovements } from '@/domain/stock/movements';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

describe('listStockHistory', () => {
  it('hareketleri en yeniden eskiye siralar', async () => {
    const item = await createStockItem(ctx.db, { name: 'Gecmis Parcasi' });
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 10, movementType: 'goods_receipt' },
    ]);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: -2, movementType: 'delivery' },
    ]);

    const history = await listStockHistory(ctx.db, ctx.branchId, item.id);

    expect(history).toHaveLength(2);
    expect(history[0].quantityChange).toBe(-2);
    expect(history[0].balanceAfter).toBe(8);
    expect(history[1].quantityChange).toBe(10);
  });

  it('hareketi olmayan kart icin bos liste doner', async () => {
    const item = await createStockItem(ctx.db, { name: 'Hareketsiz Parca' });
    expect(await listStockHistory(ctx.db, ctx.branchId, item.id)).toEqual([]);
  });

  it('limit uygulanir', async () => {
    const item = await createStockItem(ctx.db, { name: 'Cok Hareketli Parca' });
    for (let i = 0; i < 5; i += 1) {
      await applyMovements(ctx.db, ctx.branchId, [
        { stockItemId: item.id, quantityChange: 1, movementType: 'goods_receipt' },
      ]);
    }

    expect(await listStockHistory(ctx.db, ctx.branchId, item.id, 3)).toHaveLength(3);
  });

  it('ayni anda olusan hareketler bile dogru sirada doner', async () => {
    const item = await createStockItem(ctx.db, { name: 'Es Zamanli Parca' });
    // Tek transaction icinde ard arda: createdAt degerleri ayni olacak,
    // siralama yalnizca seq sayesinde deterministik.
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 4, movementType: 'goods_receipt' },
    ]);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 6, movementType: 'goods_receipt' },
    ]);

    const history = await listStockHistory(ctx.db, ctx.branchId, item.id);
    expect(history.map((entry) => entry.balanceAfter)).toEqual([10, 4]);
  });
});
