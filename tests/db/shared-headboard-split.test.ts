import { readFileSync } from 'node:fs';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { documentCounters, orderLineColors, productComponents, stockItems } from '@/db/schema';
import { createCategory } from '@/domain/catalog/categories';
import { addPaletteCode, createPalette } from '@/domain/catalog/colors';
import { createProduct } from '@/domain/catalog/products';
import { sizesMatch } from '@/domain/catalog/sizes';
import {
  createStockItem,
  findTwinCards,
  twinSetSize,
  type StockItem,
} from '@/domain/catalog/stock-items';
import { createDelivery } from '@/domain/orders/deliveries';
import { confirmOrder, createOrder, getOrder } from '@/domain/orders/orders';
import { applyMovements } from '@/domain/stock/movements';
import { onHandOf } from '../helpers/factories';
import { makeOrderCustomer } from '../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../helpers/test-db';

/**
 * 0018 gocu: ortak basligi ayirma. Goc bos veritabaninda kostugu icin hicbir
 * satira dokunmuyor; burada ayni SQL, ortak basligi olan iki takim ve acik
 * siparisler uzerinde yeniden calistiriliyor.
 */
const SPLIT = readFileSync('drizzle/0018_ortak-baslik-ayir.sql', 'utf8');

let ctx: TestDb;
let headboard: StockItem;
let single: StockItem;
let shortSet: string;
let longSet: string;
const orderIds: Record<string, string> = {};

async function counter(): Promise<number> {
  const [row] = await ctx.db
    .select({ last: documentCounters.lastNumber })
    .from(documentCounters)
    .where(eq(documentCounters.docType, 'stockItem'));
  return row.last;
}

async function setOrder(productId: string, colors?: { baseStockItemId: string; code: string }[]) {
  const customer = await makeOrderCustomer(ctx.db, ctx.scope);
  return createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-10-08',
    deliveryAddress: 'Adres',
    lines: [{ itemType: 'product', productId, quantity: 1, unitPriceKurus: 0, colors }],
  });
}

let counterBefore = 0;

beforeAll(async () => {
  ctx = await createTestDb();
  const baslik = await createCategory(ctx.db, { name: 'Baslik' });
  const palette = await createPalette(ctx.db, 'Bolme kartelasi');
  await addPaletteCode(ctx.db, palette.id, 'BK-1');

  const card = (name: string, sizeLabel: string, categoryId?: string) =>
    createStockItem(ctx.db, { name, sizeLabel, categoryId, minStockLevel: 1 });
  const y190 = await card('BOLME YATAK', '140x190');
  const y200 = await card('BOLME YATAK', '140x200');
  const b190 = await card('BOLME BAZA', '140x190');
  const b200 = await card('BOLME BAZA', '140x200');
  headboard = await createStockItem(ctx.db, {
    name: 'BOLME BASLIK',
    sizeLabel: '140 CM',
    categoryId: baslik.id,
    purchasePriceKurus: 123_400,
    colorPaletteId: palette.id,
  });
  const y160 = await card('BOLME YATAK', '160x200');
  const b160 = await card('BOLME BAZA', '160x200');
  single = await card('BOLME BASLIK', '160 CM', baslik.id);

  for (const item of [y190, y200, b190, b200, headboard]) {
    await applyMovements(ctx.db, ctx.warehouseId, [
      { stockItemId: item.id, quantityChange: 5, movementType: 'manual' },
    ]);
  }

  const make = (name: string, ids: string[]) =>
    createProduct(ctx.db, { name, components: ids.map((stockItemId) => ({ stockItemId, quantity: 1 })) });
  shortSet = (await make('BOLME 140x190 Set', [y190.id, b190.id, headboard.id])).id;
  longSet = (await make('BOLME 140x200 Set', [y200.id, b200.id, headboard.id])).id;
  await make('BOLME 160x200 Set', [y160.id, b160.id, single.id]);

  // Uzun takim, onayli, teslim yok: basligi yeni karta gecmeli.
  const open = await setOrder(longSet);
  await confirmOrder(ctx.db, ctx.scope, open.id);
  orderIds.open = open.id;

  // Uzun takim, basligi teslim edilmis: eski kartta kalmali.
  const sent = await setOrder(longSet);
  await confirmOrder(ctx.db, ctx.scope, sent.id);
  const detail = await getOrder(ctx.db, ctx.scope, sent.id);
  const head = detail.lines[0].components.find((c) => c.stockItemId === headboard.id)!;
  await createDelivery(ctx.db, ctx.scope, {
    orderId: sent.id,
    lines: [{ orderLineComponentId: head.id, quantity: 1 }],
  });
  orderIds.sent = sent.id;

  // Kisa takim: eski kartta kalmali.
  const short = await setOrder(shortSet);
  await confirmOrder(ctx.db, ctx.scope, short.id);
  orderIds.short = short.id;

  // Uzun takim taslak, basligi renkli: renk secimi yeni karta gecmeli.
  const draft = await setOrder(longSet, [{ baseStockItemId: headboard.id, code: 'BK-1' }]);
  orderIds.draft = draft.id;

  counterBefore = await counter();
  await ctx.db.execute(sql.raw(SPLIT));
});

afterAll(async () => {
  await ctx.close();
});

async function newCard(): Promise<StockItem> {
  const [row] = await ctx.db
    .select()
    .from(stockItems)
    .where(and(eq(stockItems.name, 'BOLME BASLIK'), eq(stockItems.sizeLabel, '140 CM (140x200)')));
  return row;
}

async function headComponentCard(orderId: string): Promise<string | null> {
  const detail = await getOrder(ctx.db, ctx.scope, orderId);
  return (
    detail.lines[0].components.find((c) => c.stockItemName === 'BOLME BASLIK')?.stockItemId ?? null
  );
}

describe('ortak basligi ayirma gocu', () => {
  it('uzun takim icin yeni kart acar; eski kartin olcusu kisa takimi yazar', async () => {
    const created = await newCard();
    expect(created).toMatchObject({
      sizeLabel: '140 CM (140x200)',
      categoryId: headboard.categoryId,
      purchasePriceKurus: 123_400,
      colorPaletteId: headboard.colorPaletteId,
      minStockLevel: headboard.minStockLevel,
      parentStockItemId: null,
    });
    expect(created.sku).toBe(`SK-${String(counterBefore + 1).padStart(5, '0')}`);
    expect(created.barcode).toBe(created.sku.replace('-', ''));
    expect(await counter()).toBe(counterBefore + 1);

    const [old] = await ctx.db.select().from(stockItems).where(eq(stockItems.id, headboard.id));
    expect(old.sizeLabel).toBe('140 CM (140x190)');
  });

  it('receteler: uzun takim yeni kartta, kisa takim eskide', async () => {
    const created = await newCard();
    const rows = await ctx.db
      .select()
      .from(productComponents)
      .where(eq(productComponents.stockItemId, created.id));
    expect(rows.map((row) => row.productId)).toEqual([longSet]);

    const old = await ctx.db
      .select()
      .from(productComponents)
      .where(eq(productComponents.stockItemId, headboard.id));
    expect(old.map((row) => row.productId)).toEqual([shortSet]);
  });

  it('stok eski kartta kalir', async () => {
    // 5 girdi, teslim edilen siparis 1 dusurdu.
    expect(await onHandOf(ctx.db, ctx.branchId, headboard.id)).toBe(4);
    expect(await onHandOf(ctx.db, ctx.branchId, (await newCard()).id)).toBe(0);
  });

  it('acik siparisin teslim edilmemis basligi yeni karta gecer, teslim edilmis kalir', async () => {
    const created = await newCard();
    expect(await headComponentCard(orderIds.open)).toBe(created.id);
    expect(await headComponentCard(orderIds.sent)).toBe(headboard.id);
    expect(await headComponentCard(orderIds.short)).toBe(headboard.id);
  });

  it('taslagin renk secimi yeni karta gecer; onayda yeni kartin rengi yazilir', async () => {
    const created = await newCard();
    const colors = await ctx.db.select().from(orderLineColors);
    expect(colors.map((row) => row.baseStockItemId)).toEqual([created.id]);

    await confirmOrder(ctx.db, ctx.scope, orderIds.draft);
    const detail = await getOrder(ctx.db, ctx.scope, orderIds.draft);
    const head = detail.lines[0].components.find((c) => c.stockItemName === 'BOLME BASLIK');
    expect(head?.variantLabel).toBe('BK-1');
    expect(head?.sizeLabel).toBe('140 CM (140x200)');
  });

  it('tek takimda kullanilan basliga dokunmaz', async () => {
    const [row] = await ctx.db.select().from(stockItems).where(eq(stockItems.id, single.id));
    expect(row.sizeLabel).toBe('160 CM');
  });

  /** Ikinci kez calisirsa yeni kart acmaz: artik ortak parca yok. */
  it('tekrar calistirmak bir sey degistirmez', async () => {
    const before = await counter();
    await ctx.db.execute(sql.raw(SPLIT));
    expect(await counter()).toBe(before);
  });

  /** Irsaliye "140 CM" yaziyor; mal kabulde hangi takimin basligi oldugu secilir. */
  it('mal kabul icin ikiz basliklari bulur', async () => {
    const created = await newCard();
    const twins = await findTwinCards(ctx.db, [headboard.id, single.id]);
    const expected = [
      { id: headboard.id, setSize: '140x190', label: `BOLME BASLIK · 140 CM (140x190) (${headboard.sku})` },
      { id: created.id, setSize: '140x200', label: `BOLME BASLIK · 140 CM (140x200) (${created.sku})` },
    ];
    expect(twins.get(headboard.id)).toEqual(expected);
    expect(twins.has(single.id)).toBe(false);
    expect((await findTwinCards(ctx.db, [created.id])).get(created.id)).toEqual(expected);
  });

  it('takim olcusu etiketten okunur', () => {
    expect(twinSetSize('140 CM (140x200)')).toBe('140x200');
    expect(twinSetSize('140 CM')).toBeNull();
    expect(twinSetSize(null)).toBeNull();
  });

  it('beden kopyalama yeni etiketlerle dogru basligi bulur', () => {
    expect(sizesMatch('140 CM (140x200)', '140x200')).toBe(true);
    expect(sizesMatch('140 CM (140x200)', '140x190')).toBe(false);
    expect(sizesMatch('140 CM (140x190)', '140x190')).toBe(true);
  });
});
