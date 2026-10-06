import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stockItems } from '@/db/schema';
import {
  addPaletteCode,
  adjustColorStock,
  colorCodesForItems,
  createPalette,
  ensureColorCard,
  listPalettes,
  removePaletteCode,
} from '@/domain/catalog/colors';
import { createStockItem, searchStockItems, updateStockItem } from '@/domain/catalog/stock-items';
import { normalizeColorCode, sortColorCodes } from '@/lib/color-codes';
import { onHandOf } from '../../helpers/factories';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;
let paletteId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const palette = await createPalette(ctx.db, 'Deneme kartelasi');
  paletteId = palette.id;
  await addPaletteCode(ctx.db, paletteId, 'BK-149');
  await addPaletteCode(ctx.db, paletteId, 'bk 51');
});

afterAll(async () => {
  await ctx.close();
});

async function coloredBase(name: string, sizeLabel = '160x200') {
  const base = await createStockItem(ctx.db, { name, sizeLabel, purchasePriceKurus: 500000 });
  return updateStockItem(ctx.db, base.id, { colorPaletteId: paletteId });
}

describe('renk kodu bicimi', () => {
  it('etiketteki farkli yazimlar tek koda iner', () => {
    expect(normalizeColorCode('BK 182')).toBe('BK-182');
    expect(normalizeColorCode(' bk182 ')).toBe('BK-182');
    expect(normalizeColorCode('BK-149')).toBe('BK-149');
  });

  it('numarasina gore siralar', () => {
    expect(sortColorCodes(['BK-125', 'BK-51', 'BK-172'])).toEqual(['BK-51', 'BK-125', 'BK-172']);
  });
});

describe('kartela', () => {
  it('kodlar bicimlenip sirali saklanir', async () => {
    const palette = (await listPalettes(ctx.db)).find((row) => row.id === paletteId);
    expect(palette?.codes).toEqual(['BK-51', 'BK-149']);
  });

  it('ayni kod iki kez eklenmez', async () => {
    await expect(addPaletteCode(ctx.db, paletteId, 'BK 149')).rejects.toThrow('zaten var');
  });

  it('gocun kartelalari tohumlanmis', async () => {
    const names = (await listPalettes(ctx.db)).map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(['Latex Master / Comfizone', 'Vanilla (bambi)']));
  });
});

describe('renk karti', () => {
  it('ilk istenince acilir, ana kartin adini ve olcusunu alir', async () => {
    const base = await coloredBase('DENEME BAZA');
    const card = await ensureColorCard(ctx.db, base.id, 'bk-149');

    expect(card).toMatchObject({
      name: 'DENEME BAZA',
      sizeLabel: '160x200',
      variantLabel: 'BK-149',
      parentStockItemId: base.id,
      colorPaletteId: null,
      purchasePriceKurus: 500000,
    });
    expect(card.sku).not.toBe(base.sku);
  });

  /** Kartlar silinmiyor: ayni renk icin ikinci kart kalici bir hata olurdu. */
  it('ikinci kez istenince yeni kart acmaz', async () => {
    const base = await coloredBase('DENEME BASLIK', '160 CM');
    const first = await ensureColorCard(ctx.db, base.id, 'BK-51');
    const second = await ensureColorCard(ctx.db, base.id, 'BK 51');

    expect(second.id).toBe(first.id);
    const children = await ctx.db
      .select()
      .from(stockItems)
      .where(eq(stockItems.parentStockItemId, base.id));
    expect(children).toHaveLength(1);
  });

  it('kartelada olmayan renk icin kart acmaz', async () => {
    const base = await coloredBase('DENEME BAZA 2');
    await expect(ensureColorCard(ctx.db, base.id, 'BK-999')).rejects.toThrow('rengi yok');
  });

  it('kartelasi olmayan kalemde renk olmaz', async () => {
    const plain = await createStockItem(ctx.db, { name: 'DENEME YATAK', sizeLabel: '160x200' });
    await expect(ensureColorCard(ctx.db, plain.id, 'BK-149')).rejects.toThrow('rengi yok');
  });

  /** Eski siparis kodu kartelada kaldirilmis olsa da kendi kartini bulmali. */
  it('kod kartelada kaldirilsa da var olan kart bulunur', async () => {
    const palette = await createPalette(ctx.db, 'Kaldirma kartelasi');
    await addPaletteCode(ctx.db, palette.id, 'BK-7');
    const base = await createStockItem(ctx.db, { name: 'KALDIRMA BAZA' });
    await updateStockItem(ctx.db, base.id, { colorPaletteId: palette.id });
    const card = await ensureColorCard(ctx.db, base.id, 'BK-7');

    await removePaletteCode(ctx.db, palette.id, 'BK-7');
    expect((await ensureColorCard(ctx.db, base.id, 'BK-7')).id).toBe(card.id);
  });

  it('renk kartinin rengi olmaz', async () => {
    const base = await coloredBase('DENEME BAZA 3');
    const card = await ensureColorCard(ctx.db, base.id, 'BK-149');
    await expect(ensureColorCard(ctx.db, card.id, 'BK-51')).rejects.toThrow('ana karti secin');
    await expect(updateStockItem(ctx.db, card.id, { colorPaletteId: paletteId })).rejects.toThrow(
      'kartelasi olmaz',
    );
  });

  it('veritabani ayni renkten ikinci karti reddeder', async () => {
    const base = await coloredBase('DENEME BAZA 4');
    await ensureColorCard(ctx.db, base.id, 'BK-149');
    await expect(
      createStockItem(ctx.db, {
        name: 'DENEME BAZA 4',
        variantLabel: 'BK-149',
        parentStockItemId: base.id,
      }),
    ).rejects.toThrow();
  });

  it('kartelasi olan kartlarin kodlari', async () => {
    const base = await coloredBase('DENEME BAZA 5');
    const plain = await createStockItem(ctx.db, { name: 'DENEME YATAK 5' });
    const map = await colorCodesForItems(ctx.db, [base.id, plain.id]);
    expect(map.get(base.id)).toEqual(['BK-51', 'BK-149']);
    expect(map.has(plain.id)).toBe(false);
  });

  it('parca aramasi istenirse renk kartlarini gostermez', async () => {
    const base = await coloredBase('ARAMA BAZA');
    await ensureColorCard(ctx.db, base.id, 'BK-149');

    expect(await searchStockItems(ctx.db, { query: 'ARAMA BAZA' })).toHaveLength(2);
    const onlyBase = await searchStockItems(ctx.db, { query: 'ARAMA BAZA', baseOnly: true });
    expect(onlyBase.map((item) => item.id)).toEqual([base.id]);
  });
});

describe('renk stogu', () => {
  it('ilk + renk kartini acar ve stoga isler', async () => {
    const base = await coloredBase('STOK BAZA');
    const result = await adjustColorStock(ctx.db, ctx.warehouseId, {
      baseStockItemId: base.id,
      code: 'BK-149',
      delta: 2,
    });

    const [card] = await ctx.db
      .select()
      .from(stockItems)
      .where(eq(stockItems.parentStockItemId, base.id));
    expect(result).toEqual({ stockItemId: card.id, balanceAfter: 2 });
    expect(await onHandOf(ctx.db, ctx.branchId, card.id)).toBe(2);
    expect(await onHandOf(ctx.db, ctx.branchId, base.id)).toBe(0);
  });

  /** Eksiye dusen hareket reddedilirse kart da acilmamis olmali. */
  it('hareket reddedilirse kart da acilmaz', async () => {
    const base = await coloredBase('STOK BAZA 2');
    await expect(
      adjustColorStock(ctx.db, ctx.warehouseId, { baseStockItemId: base.id, code: 'BK-51', delta: -1 }),
    ).rejects.toThrow();

    const children = await ctx.db
      .select()
      .from(stockItems)
      .where(eq(stockItems.parentStockItemId, base.id));
    expect(children).toHaveLength(0);
  });
});
