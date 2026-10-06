import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { stockItems } from '@/db/schema';
import { addPaletteCode, createPalette } from '@/domain/catalog/colors';
import { createProduct } from '@/domain/catalog/products';
import { updateStockItem } from '@/domain/catalog/stock-items';
import { loadOrderCatalog } from '@/domain/orders/catalog';
import { createDelivery } from '@/domain/orders/deliveries';
import { confirmOrder, createOrder, getOrder, updateOrder } from '@/domain/orders/orders';
import { getReservedQuantities } from '@/domain/stock/availability';
import { applyMovements } from '@/domain/stock/movements';
import { onHandOf } from '../../helpers/factories';
import { makeBedSet, makeOrderCustomer } from '../../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../../helpers/test-db';

let ctx: TestDb;
let paletteId: string;
let sequence = 0;

beforeAll(async () => {
  ctx = await createTestDb();
  paletteId = (await createPalette(ctx.db, 'Siparis kartelasi')).id;
  await addPaletteCode(ctx.db, paletteId, 'BK-149');
  await addPaletteCode(ctx.db, paletteId, 'BK-51');
});

afterAll(async () => {
  await ctx.close();
});

/** Bazasi ve basligi renkli bir takim; standart parcalardan 5'er stok. */
async function coloredSet() {
  const set = await makeBedSet(ctx.db, ctx.branchId, {
    model: `RENK${(++sequence).toString().padStart(3, '0')}`,
    size: '160x200',
    stock: 5,
  });
  await updateStockItem(ctx.db, set.baza.id, { colorPaletteId: paletteId });
  await updateStockItem(ctx.db, set.baslik.id, { colorPaletteId: paletteId });
  return set;
}

async function colorCard(baseId: string, code: string) {
  const [card] = await ctx.db
    .select()
    .from(stockItems)
    .where(eq(stockItems.parentStockItemId, baseId));
  return card?.variantLabel === code ? card : undefined;
}

async function orderWith(set: Awaited<ReturnType<typeof coloredSet>>, colors: { baseStockItemId: string; code: string }[]) {
  const customer = await makeOrderCustomer(ctx.db, ctx.scope);
  return createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-10-06',
    deliveryAddress: 'Adres',
    lines: [
      { itemType: 'product', productId: set.product.id, quantity: 1, unitPriceKurus: 1_000_000, colors },
    ],
  });
}

describe('sipariste renk', () => {
  it('aciklamaya yazilir, taslakta kart acilmaz', async () => {
    const set = await coloredSet();
    const order = await orderWith(set, [
      { baseStockItemId: set.baslik.id, code: 'bk 51' },
      { baseStockItemId: set.baza.id, code: 'BK-149' },
    ]);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.lines[0].description).toBe(`${set.product.name} (Baza BK-149, Başlık BK-51)`);
    expect(detail.lines[0].colors).toEqual(
      expect.arrayContaining([
        { baseStockItemId: set.baza.id, code: 'BK-149' },
        { baseStockItemId: set.baslik.id, code: 'BK-51' },
      ]),
    );
    expect(await colorCard(set.baza.id, 'BK-149')).toBeUndefined();
  });

  /** Canlida bir recetede baslik bazadan once tanimliydi; aciklama yine baza once. */
  it('aciklamada once baza sonra baslik, recete sirasi ne olursa olsun', async () => {
    const set = await coloredSet();
    const product = await createProduct(ctx.db, {
      name: `${set.product.name} ters`,
      components: [
        { stockItemId: set.baslik.id, quantity: 1 },
        { stockItemId: set.yatak.id, quantity: 1 },
        { stockItemId: set.baza.id, quantity: 1 },
      ],
    });
    const customer = await makeOrderCustomer(ctx.db, ctx.scope);
    const order = await createOrder(ctx.db, ctx.scope, {
      customerId: customer.id,
      orderDate: '2026-10-06',
      deliveryAddress: 'Adres',
      lines: [
        {
          itemType: 'product',
          productId: product.id,
          quantity: 1,
          unitPriceKurus: 0,
          colors: [
            { baseStockItemId: set.baslik.id, code: 'BK-51' },
            { baseStockItemId: set.baza.id, code: 'BK-149' },
          ],
        },
      ],
    });
    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.lines[0].description).toBe(`${product.name} (Baza BK-149, Başlık BK-51)`);
  });

  /** Rezerv ve teslimat renk kartindan yurur; standart parcaya dokunulmaz. */
  it('onayda renkli parcanin yerine renk karti gecer', async () => {
    const set = await coloredSet();
    const order = await orderWith(set, [{ baseStockItemId: set.baza.id, code: 'BK-149' }]);
    await confirmOrder(ctx.db, ctx.scope, order.id);

    const card = await colorCard(set.baza.id, 'BK-149');
    expect(card).toBeDefined();
    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    const ids = detail.lines[0].components.map((component) => component.stockItemId);
    expect(ids).toEqual(expect.arrayContaining([set.yatak.id, card!.id, set.baslik.id]));
    expect(ids).not.toContain(set.baza.id);
    expect(detail.lines[0].components.find((c) => c.stockItemId === card!.id)?.variantLabel).toBe(
      'BK-149',
    );

    const reserved = await getReservedQuantities(ctx.db, ctx.warehouseId, [card!.id, set.baza.id]);
    expect(reserved.get(card!.id)).toBe(1);
    expect(reserved.get(set.baza.id) ?? 0).toBe(0);
  });

  it('teslimat renk kartinin stogundan duser', async () => {
    const set = await coloredSet();
    const order = await orderWith(set, [{ baseStockItemId: set.baza.id, code: 'BK-51' }]);
    await confirmOrder(ctx.db, ctx.scope, order.id);
    const card = (await colorCard(set.baza.id, 'BK-51'))!;
    await applyMovements(ctx.db, ctx.warehouseId, [
      { stockItemId: card.id, quantityChange: 2, movementType: 'manual' },
    ]);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    const component = detail.lines[0].components.find((c) => c.stockItemId === card.id)!;
    await createDelivery(ctx.db, ctx.scope, {
      orderId: order.id,
      lines: [{ orderLineComponentId: component.id, quantity: 1 }],
    });

    expect(await onHandOf(ctx.db, ctx.branchId, card.id)).toBe(1);
    expect(await onHandOf(ctx.db, ctx.branchId, set.baza.id)).toBe(5);
  });

  it('onayli sipariste renk degistirilince bilesen de degisir', async () => {
    const set = await coloredSet();
    const order = await orderWith(set, [{ baseStockItemId: set.baza.id, code: 'BK-149' }]);
    await confirmOrder(ctx.db, ctx.scope, order.id);

    await updateOrder(ctx.db, ctx.scope, order.id, {
      lines: [
        {
          itemType: 'product',
          productId: set.product.id,
          quantity: 1,
          unitPriceKurus: 1_000_000,
          colors: [{ baseStockItemId: set.baza.id, code: 'BK-51' }],
        },
      ],
    });

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    const baza = detail.lines[0].components.find((c) => c.stockItemName === set.baza.name);
    expect(baza?.variantLabel).toBe('BK-51');
    expect(detail.lines[0].colors).toEqual([{ baseStockItemId: set.baza.id, code: 'BK-51' }]);
  });

  it('renk secilmeyen siparis eskisi gibi', async () => {
    const set = await coloredSet();
    const order = await orderWith(set, []);
    await confirmOrder(ctx.db, ctx.scope, order.id);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.lines[0].description).toBe(set.product.name);
    expect(detail.lines[0].components.map((c) => c.stockItemId)).toContain(set.baza.id);
  });

  it('tek parca satirinda renk', async () => {
    const set = await coloredSet();
    const customer = await makeOrderCustomer(ctx.db, ctx.scope);
    const order = await createOrder(ctx.db, ctx.scope, {
      customerId: customer.id,
      orderDate: '2026-10-06',
      deliveryAddress: 'Adres',
      lines: [
        {
          itemType: 'stock_item',
          stockItemId: set.baslik.id,
          quantity: 1,
          unitPriceKurus: 100_000,
          colors: [{ baseStockItemId: set.baslik.id, code: 'BK-149' }],
        },
      ],
    });
    await confirmOrder(ctx.db, ctx.scope, order.id);

    const detail = await getOrder(ctx.db, ctx.scope, order.id);
    expect(detail.lines[0].description).toBe(`${set.baslik.name} · 160 CM · BK-149`);
    expect(detail.lines[0].components[0].variantLabel).toBe('BK-149');
  });

  it('kartelada olmayan renk reddedilir', async () => {
    const set = await coloredSet();
    await expect(orderWith(set, [{ baseStockItemId: set.baza.id, code: 'BK-999' }])).rejects.toThrow(
      'rengi yok',
    );
  });

  it('renksiz parcaya renk secilemez', async () => {
    const set = await coloredSet();
    await expect(orderWith(set, [{ baseStockItemId: set.yatak.id, code: 'BK-149' }])).rejects.toThrow(
      'rengi yok',
    );
  });

  it('satirda olmayan parcaya renk secilemez', async () => {
    const set = await coloredSet();
    const other = await coloredSet();
    await expect(
      orderWith(set, [{ baseStockItemId: other.baza.id, code: 'BK-149' }]),
    ).rejects.toThrow('bu satirda yok');
  });

  it('katalog renkli parcalari ve kodlari verir, renk kartlarini listelemez', async () => {
    const set = await coloredSet();
    const order = await orderWith(set, [{ baseStockItemId: set.baza.id, code: 'BK-149' }]);
    await confirmOrder(ctx.db, ctx.scope, order.id);

    const catalog = await loadOrderCatalog(ctx.db);
    const product = catalog.products.find((entry) => entry.id === set.product.id);
    expect(product?.colorParts.map((part) => [part.label, part.codes])).toEqual([
      ['Baza', ['BK-51', 'BK-149']],
      ['Başlık', ['BK-51', 'BK-149']],
    ]);
    const bazaCards = catalog.stockItems.filter((item) => item.name === set.baza.name);
    expect(bazaCards.map((item) => item.id)).toEqual([set.baza.id]);
    expect(bazaCards[0].colorCodes).toEqual(['BK-51', 'BK-149']);
  });
});
