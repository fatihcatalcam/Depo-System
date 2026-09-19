import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stockMovements } from '@/db/schema';
import { applyMovements } from '@/domain/stock/movements';
import { NegativeStockError } from '@/lib/errors';
import { makeStockItem, onHandOf } from '../../helpers/factories';
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

describe('applyMovements', () => {
  it('giris hareketi stogu artirir ve defterde iz birakir', async () => {
    const item = await makeStockItem(ctx.db);

    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 10, movementType: 'goods_receipt' },
    ]);

    expect(await onHand(item.id)).toBe(10);

    const rows = await ctx.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.stockItemId, item.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].balanceAfter).toBe(10);
    expect(rows[0].movementType).toBe('goods_receipt');
  });

  it('cikis hareketi stogu azaltir', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 10, movementType: 'goods_receipt' },
    ]);

    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: -4, movementType: 'delivery' },
    ]);

    expect(await onHand(item.id)).toBe(6);
  });

  it('balanceAfter her harekette birikimli bakiyeyi tutar', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 5, movementType: 'goods_receipt' },
    ]);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 7, movementType: 'goods_receipt' },
    ]);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: -3, movementType: 'delivery' },
    ]);

    const rows = await ctx.db
      .select({ balance: stockMovements.balanceAfter })
      .from(stockMovements)
      .where(eq(stockMovements.stockItemId, item.id))
      .orderBy(asc(stockMovements.seq));

    expect(rows.map((r) => r.balance)).toEqual([5, 12, 9]);
  });

  it('stogu eksiye dusuren hareket reddedilir', async () => {
    const item = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: item.id, quantityChange: 2, movementType: 'goods_receipt' },
    ]);

    await expect(
      applyMovements(ctx.db, ctx.branchId, [
        { stockItemId: item.id, quantityChange: -5, movementType: 'delivery' },
      ]),
    ).rejects.toBeInstanceOf(NegativeStockError);

    expect(await onHand(item.id)).toBe(2);
  });

  it('acikca izin verilirse stok eksiye dusebilir', async () => {
    const item = await makeStockItem(ctx.db);

    await applyMovements(
      ctx.db,
      ctx.branchId,
      [{ stockItemId: item.id, quantityChange: -3, movementType: 'manual' }],
      { allowNegative: true },
    );

    expect(await onHand(item.id)).toBe(-3);
  });

  it('coklu harekette bir tanesi basarisiz olursa hicbiri uygulanmaz', async () => {
    const a = await makeStockItem(ctx.db);
    const b = await makeStockItem(ctx.db);
    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: a.id, quantityChange: 10, movementType: 'goods_receipt' },
    ]);

    await expect(
      applyMovements(ctx.db, ctx.branchId, [
        { stockItemId: a.id, quantityChange: -1, movementType: 'delivery' },
        { stockItemId: b.id, quantityChange: -1, movementType: 'delivery' },
      ]),
    ).rejects.toBeInstanceOf(NegativeStockError);

    expect(await onHand(a.id)).toBe(10);
    expect(await onHand(b.id)).toBe(0);
  });

  it('sifir miktarli hareket reddedilir', async () => {
    const item = await makeStockItem(ctx.db);
    await expect(
      applyMovements(ctx.db, ctx.branchId, [{ stockItemId: item.id, quantityChange: 0, movementType: 'manual' }]),
    ).rejects.toThrow('Hareket miktari sifir olamaz');
  });

  it('olmayan stok kartina hareket islenemez', async () => {
    await expect(
      applyMovements(ctx.db, ctx.branchId, [
        {
          stockItemId: '11111111-1111-1111-1111-111111111111',
          quantityChange: 1,
          movementType: 'manual',
        },
      ]),
    ).rejects.toThrow('bulunamadi');
  });

  it('kaynak belge bilgisi harekete yazilir', async () => {
    const item = await makeStockItem(ctx.db);
    const referenceId = '22222222-2222-2222-2222-222222222222';

    await applyMovements(ctx.db, ctx.branchId, [
      {
        stockItemId: item.id,
        quantityChange: 3,
        movementType: 'goods_receipt',
        referenceType: 'goods_receipt',
        referenceId,
      },
    ]);

    const [row] = await ctx.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.stockItemId, item.id));
    expect(row.referenceType).toBe('goods_receipt');
    expect(row.referenceId).toBe(referenceId);
  });

  /**
   * Stok listesindeki hizli +/- bu doner degere guveniyor: ekrandaki sayiyi
   * router.refresh() beklemeden buradan duzeltiyor.
   */
  it('olusan bakiyeleri geri doner', async () => {
    const first = await makeStockItem(ctx.db);
    const second = await makeStockItem(ctx.db);

    await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: first.id, quantityChange: 6, movementType: 'goods_receipt' },
    ]);

    const results = await applyMovements(ctx.db, ctx.branchId, [
      { stockItemId: first.id, quantityChange: -2, movementType: 'manual' },
      { stockItemId: second.id, quantityChange: 4, movementType: 'goods_receipt' },
    ]);

    expect(results).toHaveLength(2);
    expect(results.find((row) => row.stockItemId === first.id)?.balanceAfter).toBe(4);
    expect(results.find((row) => row.stockItemId === second.id)?.balanceAfter).toBe(4);
    expect(await onHand(first.id)).toBe(4);
  });

  it('hareket yoksa bos dizi doner', async () => {
    expect(await applyMovements(ctx.db, ctx.branchId, [])).toEqual([]);
  });
});
