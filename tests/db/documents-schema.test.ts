import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  appSettings,
  customers,
  orderLineComponents,
  orderLines,
  orders,
  stockItems,
} from '@/db/schema';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

let sequence = 0;
const uniqueSuffix = () => (++sequence).toString().padStart(5, '0');

async function seedOrderLine() {
  const suffix = uniqueSuffix();
  const [customer] = await ctx.db
    .insert(customers)
    .values({ code: `MS-${suffix}`, name: 'Fatih Catalcam' })
    .returning();
  const [order] = await ctx.db
    .insert(orders)
    .values({
      orderNo: `SP-2026-${suffix}`,
      customerId: customer.id,
      orderDate: '2026-08-08',
      deliveryAddress: 'Ornek Mah. 1. Sok. No:1',
    })
    .returning();
  const [item] = await ctx.db
    .insert(stockItems)
    .values({ sku: `SK-${suffix}`, name: 'Yatak A Baslik' })
    .returning();
  const [line] = await ctx.db
    .insert(orderLines)
    .values({
      orderId: order.id,
      lineNo: 1,
      itemType: 'stock_item',
      stockItemId: item.id,
      description: 'Yatak A Baslik',
      quantity: 2,
    })
    .returning();
  return { order, line, item };
}

describe('belge semasi', () => {
  it('teslim edilen miktar toplam miktari asamaz', async () => {
    const { line, item } = await seedOrderLine();
    const [component] = await ctx.db
      .insert(orderLineComponents)
      .values({
        orderLineId: line.id,
        stockItemId: item.id,
        quantityPerUnit: 1,
        totalQuantity: 2,
      })
      .returning();

    await expect(
      ctx.db
        .update(orderLineComponents)
        .set({ deliveredQuantity: 3 })
        .where(eq(orderLineComponents.id, component.id)),
    ).rejects.toThrow();
  });

  it('urun tipli satirda stok karti referansi olamaz', async () => {
    const { order, item } = await seedOrderLine();

    await expect(
      ctx.db.insert(orderLines).values({
        orderId: order.id,
        lineNo: 2,
        itemType: 'product',
        stockItemId: item.id,
        description: 'Gecersiz satir',
        quantity: 1,
      }),
    ).rejects.toThrow();
  });

  it('siparis varsayilan olarak taslak durumunda baslar', async () => {
    const { order } = await seedOrderLine();
    expect(order.status).toBe('draft');
  });

  it('ayarlar tablosuna ikinci satir eklenemez', async () => {
    await ctx.db.insert(appSettings).values({ id: 1, companyName: 'Test Mobilya' });
    await expect(
      ctx.db.insert(appSettings).values({ id: 2, companyName: 'Ikinci' }),
    ).rejects.toThrow();
  });
});
