import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stockItems } from '@/db/schema';
import { createStockItem } from '@/domain/catalog/stock-items';
import { recalculateStockBalances } from '@/domain/stock/maintenance';
import { applyMovements } from '@/domain/stock/movements';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

async function onHand(id: string) {
  const [row] = await ctx.db
    .select({ q: stockItems.quantityOnHand })
    .from(stockItems)
    .where(eq(stockItems.id, id));
  return row.q;
}

describe('recalculateStockBalances', () => {
  /**
   * Bu testin varlik sebebi: fonksiyonun ilk hali iliskili alt sorgu
   * kullaniyordu ve Drizzle join'siz sorgularda kolonlari nitelemedigi icin
   * defter toplami her kart icin 0 donuyordu. Sonuc: tum stok sifirlanmisti.
   */
  it('hareketi olan kartlarin bakiyesini SIFIRLAMAZ', async () => {
    const item = await createStockItem(ctx.db, { name: 'Bozulmamali Parca' });
    await applyMovements(ctx.db, [
      { stockItemId: item.id, quantityChange: 7, movementType: 'goods_receipt' },
    ]);

    const result = await recalculateStockBalances(ctx.db);

    expect(await onHand(item.id)).toBe(7);
    expect(result.changes.find((c) => c.sku === item.sku)).toBeUndefined();
  });

  it('tutarli veride hicbir sey degistirmez', async () => {
    const fresh = await createTestDb();
    const item = await createStockItem(fresh.db, { name: 'Tutarli Parca' });
    await applyMovements(fresh.db, [
      { stockItemId: item.id, quantityChange: 5, movementType: 'goods_receipt' },
    ]);
    await applyMovements(fresh.db, [
      { stockItemId: item.id, quantityChange: -2, movementType: 'delivery' },
    ]);

    expect(await recalculateStockBalances(fresh.db)).toEqual({ fixed: 0, changes: [] });
    await fresh.close();
  });

  it('kaymis bakiyeyi defterdeki degere geri getirir', async () => {
    const fresh = await createTestDb();
    const item = await createStockItem(fresh.db, { name: 'Kaymis Parca' });
    await applyMovements(fresh.db, [
      { stockItemId: item.id, quantityChange: 9, movementType: 'goods_receipt' },
    ]);

    // Disaridan mudahale simulasyonu: onbellek defterle uyumsuz hale getiriliyor.
    await fresh.db
      .update(stockItems)
      .set({ quantityOnHand: 0 })
      .where(eq(stockItems.id, item.id));

    const result = await recalculateStockBalances(fresh.db);

    expect(result.fixed).toBe(1);
    expect(result.changes[0]).toMatchObject({ from: 0, to: 9 });

    const [row] = await fresh.db
      .select({ q: stockItems.quantityOnHand })
      .from(stockItems)
      .where(eq(stockItems.id, item.id));
    expect(row.q).toBe(9);

    await fresh.close();
  });

  it('hic hareketi olmayan kart sifirda kalir', async () => {
    const fresh = await createTestDb();
    const item = await createStockItem(fresh.db, { name: 'Hareketsiz Parca' });

    const result = await recalculateStockBalances(fresh.db);

    expect(result.fixed).toBe(0);
    const [row] = await fresh.db
      .select({ q: stockItems.quantityOnHand })
      .from(stockItems)
      .where(eq(stockItems.id, item.id));
    expect(row.q).toBe(0);

    await fresh.close();
  });

  it('cok sayida kartta yalnizca kaymis olanlara dokunur', async () => {
    const fresh = await createTestDb();
    const items = [];
    for (let i = 0; i < 5; i += 1) {
      const item = await createStockItem(fresh.db, { name: `Toplu Parca ${i}` });
      await applyMovements(fresh.db, [
        { stockItemId: item.id, quantityChange: 3, movementType: 'goods_receipt' },
      ]);
      items.push(item);
    }

    await fresh.db
      .update(stockItems)
      .set({ quantityOnHand: 99 })
      .where(eq(stockItems.id, items[2].id));

    const result = await recalculateStockBalances(fresh.db);

    expect(result.fixed).toBe(1);
    expect(result.changes[0]).toMatchObject({ from: 99, to: 3 });

    const rows = await fresh.db.select({ q: stockItems.quantityOnHand }).from(stockItems);
    expect(rows.every((row) => row.q === 3)).toBe(true);

    await fresh.close();
  });
});
