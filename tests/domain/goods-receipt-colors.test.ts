import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stockItems } from '@/db/schema';
import { addPaletteCode, createPalette, ensureColorCard } from '@/domain/catalog/colors';
import { suggestSizeCounterparts } from '@/domain/catalog/products';
import { createStockItem, updateStockItem } from '@/domain/catalog/stock-items';
import { createGoodsReceipt, getGoodsReceipt } from '@/domain/goods-receipt';
import { onHandOf } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;
let paletteId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  paletteId = (await createPalette(ctx.db, 'Mal kabul kartelasi')).id;
  await addPaletteCode(ctx.db, paletteId, 'BK-149');
});

afterAll(async () => {
  await ctx.close();
});

async function coloredBase(name: string, sizeLabel = '160x200') {
  const base = await createStockItem(ctx.db, { name, sizeLabel });
  return updateStockItem(ctx.db, base.id, { colorPaletteId: paletteId });
}

describe('mal kabulde renk', () => {
  it('renkli satir o rengin kartina girer, kart yoksa acilir', async () => {
    const base = await coloredBase('MK BAZA');
    const receipt = await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-10-06',
      lines: [
        { stockItemId: base.id, quantity: 2, colorCode: 'BK-149' },
        { stockItemId: base.id, quantity: 1, colorCode: 'bk 149' },
        { stockItemId: base.id, quantity: 4 },
      ],
    });

    const card = await ensureColorCard(ctx.db, base.id, 'BK-149');
    expect(await onHandOf(ctx.db, ctx.branchId, card.id)).toBe(3);
    expect(await onHandOf(ctx.db, ctx.branchId, base.id)).toBe(4);

    const detail = await getGoodsReceipt(ctx.db, ctx.scope, receipt.id);
    const colored = detail.lines.find((line) => line.stockItemId === card.id);
    expect(colored).toMatchObject({ quantity: 3, variantLabel: 'BK-149' });
  });

  it('kartelada olmayan renkte mal kabul olmaz, hicbir sey yazilmaz', async () => {
    const base = await coloredBase('MK BAZA 2');
    await expect(
      createGoodsReceipt(ctx.db, ctx.scope, {
        receivedAt: '2026-10-06',
        lines: [{ stockItemId: base.id, quantity: 1, colorCode: 'BK-999' }],
      }),
    ).rejects.toThrow('rengi yok');
    expect(await onHandOf(ctx.db, ctx.branchId, base.id)).toBe(0);
  });

  /** Yeni urun bir rengin kartina yazilmasin: ad ve olcu ayni, renk karti degil. */
  it('yeni kart kontrolu renk kartini ana kart saymaz', async () => {
    const base = await coloredBase('MK BASLIK', '160 CM');
    const card = await ensureColorCard(ctx.db, base.id, 'BK-149');

    await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-10-06',
      lines: [],
      newItems: [{ name: 'MK BASLIK', sizeLabel: '160 CM', quantity: 2 }],
    });

    expect(await onHandOf(ctx.db, ctx.branchId, base.id)).toBe(2);
    expect(await onHandOf(ctx.db, ctx.branchId, card.id)).toBe(0);
    const sameName = await ctx.db.select().from(stockItems).where(eq(stockItems.name, 'MK BASLIK'));
    expect(sameName).toHaveLength(2);
  });

  /** Beden kopyalamada renk karti ana kartin yerine gecmesin. */
  it('beden kopyalama renk kartini onermez', async () => {
    // Kaynagin eski usul kendi renk etiketi var; hedef boyutta ayni etiketli
    // kart yok, aday listesi tum eslesenlere aciliyor. Renk karti oraya
    // girerse secim belirsizlesirdi.
    const source = await createStockItem(ctx.db, {
      name: 'MK KOPYA BAZA',
      sizeLabel: '160x200',
      variantLabel: 'ESKI-1',
    });
    const target = await coloredBase('MK KOPYA BAZA', '180x200');
    await ensureColorCard(ctx.db, target.id, 'BK-149');

    const result = await suggestSizeCounterparts(ctx.db, [source.id], '180x200');
    const suggestion = result.get(source.id);
    expect(suggestion?.candidates.map((candidate) => candidate.id)).toEqual([target.id]);
    expect(suggestion?.selectedId).toBe(target.id);
  });
});
