import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { goodsReceipts, stockItems } from '@/db/schema';
import { createCategory } from '@/domain/catalog/categories';
import { createStockItem } from '@/domain/catalog/stock-items';
import { createGoodsReceipt, getGoodsReceipt } from '@/domain/goods-receipt';
import { onHandOf } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;
let moduler: string;

beforeAll(async () => {
  ctx = await createTestDb();
  moduler = (await createCategory(ctx.db, { name: 'Moduler' })).id;
});

afterAll(async () => {
  await ctx.close();
});

async function cardsNamed(name: string) {
  return ctx.db.select().from(stockItems).where(eq(stockItems.name, name));
}

describe('mal kabulle yeni kart', () => {
  /** Kullanici "stoklara eklensin" dedi: kart acilir ve stoga girer. */
  it('katalogda olmayan urun icin kart acar ve stoga isler', async () => {
    const receipt = await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-09-30',
      lines: [],
      newItems: [{ name: 'TRAVİNA KAPAK ÇİFT ALÜMİNYUM', categoryId: moduler, quantity: 6 }],
    });

    const [card] = await cardsNamed('TRAVİNA KAPAK ÇİFT ALÜMİNYUM');
    expect(card.categoryId).toBe(moduler);
    expect(card.sku).toMatch(/^SK-/);
    expect(await onHandOf(ctx.db, ctx.branchId, card.id)).toBe(6);

    const detail = await getGoodsReceipt(ctx.db, ctx.scope, receipt.id);
    expect(detail.lines.map((line) => [line.stockItemId, line.quantity])).toEqual([[card.id, 6]]);
  });

  /** Excel'de ayni urun iki satirda gecerse iki kart degil, tek kart. */
  it('ayni ad ve olcu iki kez gelirse tek kart acar', async () => {
    await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-09-30',
      lines: [],
      newItems: [
        { name: 'ORTAK DOLAP 1 KAPI GVD', categoryId: moduler, quantity: 1 },
        { name: 'ortak dolap 1 kapı gvd', categoryId: moduler, quantity: 1 },
      ],
    });

    const cards = await cardsNamed('ORTAK DOLAP 1 KAPI GVD');
    expect(cards).toHaveLength(1);
    expect(await onHandOf(ctx.db, ctx.branchId, cards[0].id)).toBe(2);
  });

  /**
   * Stok kartlari silinmiyor; mukerrer kart kalici bir hata olurdu. Ayni ad
   * ve olcude kart zaten varsa (Turkce harf farkiyla bile) o kullanilir.
   */
  it('kart zaten varsa yenisini acmaz', async () => {
    const existing = await createStockItem(ctx.db, { name: 'FRESHCELL WELLDORA' });

    await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-09-30',
      lines: [],
      newItems: [{ name: 'FRESHCELL  WELLDORA', quantity: 2 }],
    });

    expect(await cardsNamed('FRESHCELL WELLDORA')).toHaveLength(1);
    expect(await onHandOf(ctx.db, ctx.branchId, existing.id)).toBe(2);
  });

  it('olcusu farkliysa ayri karttir', async () => {
    await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-09-30',
      lines: [],
      newItems: [
        { name: 'NOVERA YATAK', sizeLabel: '90x200', quantity: 1 },
        { name: 'NOVERA YATAK', sizeLabel: '100x200', quantity: 1 },
      ],
    });
    expect(await cardsNamed('NOVERA YATAK')).toHaveLength(2);
  });

  it('mevcut satirlarla birlikte calisir', async () => {
    const known = await createStockItem(ctx.db, { name: 'BILINEN PARCA' });

    const receipt = await createGoodsReceipt(ctx.db, ctx.scope, {
      receivedAt: '2026-09-30',
      lines: [{ stockItemId: known.id, quantity: 3 }],
      newItems: [{ name: 'BILINMEYEN PARCA', quantity: 4 }],
    });

    const detail = await getGoodsReceipt(ctx.db, ctx.scope, receipt.id);
    expect(detail.lines).toHaveLength(2);
    expect(detail.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(7);
  });

  /** Kayit yarida kalirsa kart da acilmamis olmali: tek transaction. */
  it('hata olursa kart da acilmaz', async () => {
    const before = await ctx.db.select().from(goodsReceipts);

    await expect(
      createGoodsReceipt(ctx.db, ctx.scope, {
        receivedAt: '2026-09-30',
        lines: [{ stockItemId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
        newItems: [{ name: 'YARIM KALAN KART', quantity: 1 }],
      }),
    ).rejects.toThrow();

    expect(await cardsNamed('YARIM KALAN KART')).toHaveLength(0);
    expect(await ctx.db.select().from(goodsReceipts)).toHaveLength(before.length);
  });

  it('adi bos yeni kart reddedilir', async () => {
    await expect(
      createGoodsReceipt(ctx.db, ctx.scope, {
        receivedAt: '2026-09-30',
        lines: [],
        newItems: [{ name: '   ', quantity: 1 }],
      }),
    ).rejects.toThrow('adi bos olamaz');
  });
});
