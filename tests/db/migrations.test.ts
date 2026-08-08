import { afterAll, beforeAll, expect, it } from 'vitest';
import { categories, productComponents, products, stockItems } from '@/db/schema';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

it('gocler uygulanir, tum katalog tablolari sorgulanabilir', async () => {
  // Tablo yoksa sorgu hata firlatir; bos dizi donmesi tablonun var oldugunu kanitlar.
  expect(await ctx.db.select().from(categories)).toEqual([]);
  expect(await ctx.db.select().from(stockItems)).toEqual([]);
  expect(await ctx.db.select().from(products)).toEqual([]);
  expect(await ctx.db.select().from(productComponents)).toEqual([]);
});
