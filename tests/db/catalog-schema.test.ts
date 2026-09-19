import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categories, productComponents, products, stockItems } from '@/db/schema';
import { onHandOf } from '../helpers/factories';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

describe('katalog semasi', () => {
  it('ayni ust kategori altinda ayni isim iki kez olusturulamaz', async () => {
    await ctx.db.insert(categories).values({ name: 'Yatak' });
    await expect(ctx.db.insert(categories).values({ name: 'Yatak' })).rejects.toThrow();
  });

  it('stok karti varsayilan olarak sifir adet ve aktif baslar', async () => {
    const [item] = await ctx.db
      .insert(stockItems)
      .values({ sku: 'SK-00001', name: 'Yatak A Baslik' })
      .returning();

    expect(await onHandOf(ctx.db, ctx.branchId, item.id)).toBe(0);
    expect(item.isActive).toBe(true);
    expect(item.unit).toBe('adet');
  });

  it('recete miktari sifir veya negatif olamaz', async () => {
    const [product] = await ctx.db
      .insert(products)
      .values({ code: 'UR-00001', name: 'Yatak A 90x190' })
      .returning();
    const [item] = await ctx.db
      .insert(stockItems)
      .values({ sku: 'SK-00002', name: 'Yatak A Ayak' })
      .returning();

    await expect(
      ctx.db
        .insert(productComponents)
        .values({ productId: product.id, stockItemId: item.id, quantity: 0 }),
    ).rejects.toThrow();
  });

  it('recetesi olan stok karti silinemez', async () => {
    const [product] = await ctx.db
      .insert(products)
      .values({ code: 'UR-00002', name: 'Yatak B 100x200' })
      .returning();
    const [item] = await ctx.db
      .insert(stockItems)
      .values({ sku: 'SK-00003', name: 'Yatak B Sasi' })
      .returning();
    await ctx.db
      .insert(productComponents)
      .values({ productId: product.id, stockItemId: item.id, quantity: 1 });

    await expect(ctx.db.delete(stockItems).where(eq(stockItems.id, item.id))).rejects.toThrow();
  });
});
