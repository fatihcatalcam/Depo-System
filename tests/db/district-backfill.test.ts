import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { orders } from '@/db/schema';
import { createOrder } from '@/domain/orders/orders';
import { makeBedSet, makeOrderCustomer } from '../helpers/order-fixtures';
import { createTestDb, type TestDb } from '../helpers/test-db';

/**
 * 0015 gocundeki ilce doldurma kurali. Goc bos veritabaninda kostugu icin
 * kural orada hicbir satira dokunmuyor; burada ayni SQL, adresi dolu
 * siparisler uzerinde yeniden calistiriliyor.
 */
const BACKFILL = readFileSync('drizzle/0015_teslimat-ilce.sql', 'utf8')
  .split('--> statement-breakpoint')
  .map((statement) => statement.trim())
  .find((statement) => statement.includes('WITH district'));

let ctx: TestDb;
let productId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const set = await makeBedSet(ctx.db, ctx.warehouseId, { model: 'ILCE', size: '160x200' });
  productId = set.product.id;
});

afterAll(async () => {
  await ctx.close();
});

async function districtFor(address: string): Promise<string | null> {
  const customer = await makeOrderCustomer(ctx.db, ctx.scope);
  const order = await createOrder(ctx.db, ctx.scope, {
    customerId: customer.id,
    orderDate: '2026-09-10',
    deliveryAddress: address,
    lines: [{ itemType: 'product', productId, quantity: 1, unitPriceKurus: 100_000 }],
  });
  await ctx.db.execute(sql.raw(BACKFILL!));
  const [row] = await ctx.db
    .select({ district: orders.deliveryDistrict })
    .from(orders)
    .where(eq(orders.id, order.id));
  return row.district;
}

describe('mevcut siparislerin ilcesi', () => {
  it('gocte doldurma adimi var', () => {
    expect(BACKFILL).toBeDefined();
  });

  it('buyuk harfli Turkce adresten ilceyi bulur', async () => {
    expect(await districtFor('BAŞAKŞEHİR KAYABAŞI MAH. ZÜMRÜT SİTESİ')).toBe('Başakşehir');
    expect(await districtFor('İSTASYON MAH. 1.ÇAĞLAR SOK. KÜÇÜKÇEKMECE')).toBe('Küçükçekmece');
  });

  it('Turkce harfsiz yazilmis ilceyi de bulur', async () => {
    expect(await districtFor('kadikoy moda cad no 5')).toBe('Kadıköy');
  });

  /** "Kartaltepe" bir mahalle; Kartal ilcesine yazilmamali. */
  it('kelimenin parcasini ilce saymaz', async () => {
    expect(await districtFor('KARTALTEPE MAH. 5. SOK.')).toBeNull();
  });

  /** Iki ilce geciyorsa hangisi dogru bilinemez; bos kalir, elle girilir. */
  it('birden fazla ilce geciyorsa bos birakir', async () => {
    expect(await districtFor('FATİH SULTAN MEHMET CAD. ÜMRANİYE')).toBeNull();
  });

  it('ilce yoksa bos birakir', async () => {
    expect(await districtFor('KALİFORNİYA AMERİKA')).toBeNull();
  });

  it('Eyüp kisa yazimi Eyüpsultan olur', async () => {
    expect(await districtFor('EYÜP DEFTERDAR MAH.')).toBe('Eyüpsultan');
  });

  it('il ve ulke varsayilanla gelir', async () => {
    const customer = await makeOrderCustomer(ctx.db, ctx.scope);
    const order = await createOrder(ctx.db, ctx.scope, {
      customerId: customer.id,
      orderDate: '2026-09-10',
      deliveryAddress: 'Adres',
      lines: [{ itemType: 'product', productId, quantity: 1, unitPriceKurus: 100_000 }],
    });
    expect(order.deliveryCity).toBe('İstanbul');
    expect(order.deliveryCountry).toBe('Türkiye');
    expect(order.deliveryDistrict).toBeNull();
  });
});
