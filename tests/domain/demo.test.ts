import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from '@/db/schema';
import type { Db } from '@/db/types';
import { verifyUnlockPassword } from '@/domain/auth';
import { listBranches } from '@/domain/branches';
import { isDemoDatabase } from '@/domain/demo/guard';
import { readDemoReceiptSample } from '@/domain/demo/receipt-samples';
import { resetDemo } from '@/domain/demo/reset';
import { DEMO_COMPANY } from '@/domain/demo/seed';
import { getSettings } from '@/domain/settings';
import { DEMO_UNLOCK_PASSWORD } from '@/lib/demo';
import { createTestDb, type TestDb } from '../helpers/test-db';

/**
 * PGlite yalnizca var olan bir veritabanina acilabiliyor: once varsayilan
 * veritabaninda `depo_demo` olusturulup klasor dokuluyor, sonra o adla
 * yeniden aciliyor. Boylece guard'in baktigi `current_database()` gercekten
 * `depo_demo` donuyor.
 */
async function openDemoDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const seedClient = new PGlite();
  await seedClient.exec('CREATE DATABASE depo_demo');
  const dump = await seedClient.dumpDataDir('none');
  await seedClient.close();

  const client = new PGlite({ loadDataDir: dump, database: 'depo_demo' });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: './drizzle' });
  return { db: db as unknown as Db, close: () => client.close() };
}

async function counts(db: Db) {
  const [customers, orders, stockItems, salespeople] = await Promise.all([
    db.select().from(schema.customers),
    db.select().from(schema.orders),
    db.select().from(schema.stockItems),
    db.select().from(schema.salespeople),
  ]);
  return {
    customers: customers.length,
    orders: orders.length,
    stockItems: stockItems.length,
    salespeople: salespeople.length,
  };
}

describe('demo sifirlama', () => {
  let demo: { db: Db; close: () => Promise<void> };

  beforeAll(async () => {
    demo = await openDemoDb();
  }, 60_000);
  afterAll(() => demo.close());
  afterEach(() => vi.unstubAllEnvs());

  it('demo veritabanini taniyor', async () => {
    expect(await isDemoDatabase(demo.db)).toBe(true);
  });

  it('demo verisini yazar: musteriler, siparisler, firma ve kilit parolasi', async () => {
    await resetDemo(demo.db, { requireFlag: false });

    expect(await counts(demo.db)).toEqual({ customers: 10, orders: 12, stockItems: 46, salespeople: 3 });
    expect((await getSettings(demo.db)).companyName).toBe(DEMO_COMPANY);
    expect(await verifyUnlockPassword(demo.db, DEMO_UNLOCK_PASSWORD)).toBe(true);
    expect((await listBranches(demo.db)).map((branch) => branch.name)).toEqual(['Merkez', 'Şube 2']);
  }, 60_000);

  it('ikinci sifirlama ziyaretcinin girdigini siler, veriyi ikiye katlamaz', async () => {
    await demo.db.insert(schema.customers).values({
      branchId: (await listBranches(demo.db))[0].id,
      code: 'ZIYARETCI',
      name: 'Ziyaretçinin müşterisi',
    });

    await resetDemo(demo.db, { requireFlag: false });

    expect(await counts(demo.db)).toEqual({ customers: 10, orders: 12, stockItems: 46, salespeople: 3 });
  }, 60_000);

  it('hazir irsaliyelerin kayitli sonucu o geceki kartlara cevrilir', async () => {
    const result = await readDemoReceiptSample(demo.db, 'foto');
    if (!result.ok) throw new Error(result.error);

    const matched = result.lines.filter((line) => line.stockItemId);
    expect(matched).toHaveLength(5);
    expect(matched[0].label).toMatch(/^LUNA VISCO YATAK · 160x200 \(SK-/);
    // Katalogda olmayan urun: kart onerisi, kategorisi bu geceki kimlikle.
    const missing = result.lines.find((line) => !line.stockItemId);
    expect(missing?.suggestion?.name).toBe('ORKİDE PEDLİ YATAK');
    expect(missing?.suggestion?.categoryId).toBeTruthy();

    for (const id of ['pdf', 'excel']) {
      const other = await readDemoReceiptSample(demo.db, id);
      expect(other.ok && other.lines.length).toBeGreaterThan(0);
    }
    expect(await readDemoReceiptSample(demo.db, 'yok')).toEqual({ ok: false, error: 'Örnek bulunamadı.' });
  });

  it('Vercel isi bayrak ister; bayrak yoksa reddeder', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '');
    await expect(resetDemo(demo.db)).rejects.toThrow('yalnızca demoda');

    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '1');
    await expect(resetDemo(demo.db)).resolves.toBeUndefined();
  }, 60_000);
});

describe('demo olmayan veritabani', () => {
  let ctx: TestDb;

  beforeAll(async () => {
    ctx = await createTestDb();
  });
  afterAll(() => ctx.close());
  afterEach(() => vi.unstubAllEnvs());

  it('bayrak acik olsa bile baska adli veritabanini sifirlamaz', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', '1');
    await ctx.db.insert(schema.customers).values({
      branchId: ctx.branchId,
      code: 'GERCEK',
      name: 'Gerçek müşteri',
    });

    await expect(resetDemo(ctx.db)).rejects.toThrow('"depo_demo" veritabanında');
    expect((await ctx.db.select().from(schema.customers)).map((row) => row.name)).toEqual([
      'Gerçek müşteri',
    ]);
  });
});
