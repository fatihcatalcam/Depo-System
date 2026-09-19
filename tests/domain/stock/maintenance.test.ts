import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stockBalances } from '@/db/schema';
import { createStockItem } from '@/domain/catalog/stock-items';
import { recalculateStockBalances } from '@/domain/stock/maintenance';
import { applyMovements } from '@/domain/stock/movements';
import { onHandOf } from '../../helpers/factories';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

async function onHand(id: string) {
  return onHandOf(ctx.db, ctx.branchId, id);
}

/** Disaridan mudahale simulasyonu: onbellegi defterle uyumsuz hale getirir. */
async function forceBalance(ctx: TestDb, stockItemId: string, quantity: number) {
  await ctx.db
    .update(stockBalances)
    .set({ quantityOnHand: quantity })
    .where(
      and(
        eq(stockBalances.branchId, ctx.branchId),
        eq(stockBalances.stockItemId, stockItemId),
      ),
    );
}

describe('recalculateStockBalances', () => {
  /**
   * Bu testin varlik sebebi: fonksiyonun ilk hali iliskili alt sorgu
   * kullaniyordu ve Drizzle join'siz sorgularda kolonlari nitelemedigi icin
   * defter toplami her kart icin 0 donuyordu. Sonuc: tum stok sifirlanmisti.
   */
  it('hareketi olan kartlarin bakiyesini SIFIRLAMAZ', async () => {
    const item = await createStockItem(ctx.db, { name: 'Bozulmamali Parca' });
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 7, movementType: 'goods_receipt' },
    ]);

    const result = await recalculateStockBalances(ctx.db, ctx.branchId);

    expect(await onHand(item.id)).toBe(7);
    expect(result.changes.find((c) => c.sku === item.sku)).toBeUndefined();
  });

  it('tutarli veride hicbir sey degistirmez', async () => {
    const fresh = await createTestDb();
    const item = await createStockItem(fresh.db, { name: 'Tutarli Parca' });
    await applyMovements(fresh.db, fresh.branchId, [
      { stockItemId: item.id, quantityChange: 5, movementType: 'goods_receipt' },
    ]);
    await applyMovements(fresh.db, fresh.branchId, [
      { stockItemId: item.id, quantityChange: -2, movementType: 'delivery' },
    ]);

    expect(await recalculateStockBalances(fresh.db, fresh.branchId)).toEqual({ fixed: 0, changes: [] });
    await fresh.close();
  });

  it('kaymis bakiyeyi defterdeki degere geri getirir', async () => {
    const fresh = await createTestDb();
    const item = await createStockItem(fresh.db, { name: 'Kaymis Parca' });
    await applyMovements(fresh.db, fresh.branchId, [
      { stockItemId: item.id, quantityChange: 9, movementType: 'goods_receipt' },
    ]);

    await forceBalance(fresh, item.id, 0);

    const result = await recalculateStockBalances(fresh.db, fresh.branchId);

    expect(result.fixed).toBe(1);
    expect(result.changes[0]).toMatchObject({ from: 0, to: 9 });

    expect(await onHandOf(fresh.db, fresh.branchId, item.id)).toBe(9);

    await fresh.close();
  });

  it('hic hareketi olmayan kart sifirda kalir', async () => {
    const fresh = await createTestDb();
    const item = await createStockItem(fresh.db, { name: 'Hareketsiz Parca' });

    const result = await recalculateStockBalances(fresh.db, fresh.branchId);

    expect(result.fixed).toBe(0);
    expect(await onHandOf(fresh.db, fresh.branchId, item.id)).toBe(0);

    await fresh.close();
  });

  it('cok sayida kartta yalnizca kaymis olanlara dokunur', async () => {
    const fresh = await createTestDb();
    const items = [];
    for (let i = 0; i < 5; i += 1) {
      const item = await createStockItem(fresh.db, { name: `Toplu Parca ${i}` });
      await applyMovements(fresh.db, fresh.branchId, [
        { stockItemId: item.id, quantityChange: 3, movementType: 'goods_receipt' },
      ]);
      items.push(item);
    }

    await forceBalance(fresh, items[2].id, 99);

    const result = await recalculateStockBalances(fresh.db, fresh.branchId);

    expect(result.fixed).toBe(1);
    expect(result.changes[0]).toMatchObject({ from: 99, to: 3 });

    const quantities = await Promise.all(
      items.map((item) => onHandOf(fresh.db, fresh.branchId, item.id)),
    );
    expect(quantities.every((quantity) => quantity === 3)).toBe(true);

    await fresh.close();
  });
});
