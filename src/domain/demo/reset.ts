import { sql } from 'drizzle-orm';
import type { Db, Tx } from '@/db/types';
import { assertDemo } from './guard';
import { seedDemo } from './seed';

/**
 * Demoda her gece temizlenen tablolar: ziyaretcilerin girdigi her sey.
 *
 * Kalanlar: `branches` (sube kimlikleri gocle olusuyor, oturum cerezleri
 * onlara bagli), `app_settings` (tek satir; seed uzerine yaziyor) ve
 * `exchange_rates` (TCMB kurlari, is verisi degil).
 */
const TABLES = [
  'delivery_lines',
  'deliveries',
  'payments',
  'order_line_colors',
  'order_line_components',
  'order_lines',
  'orders',
  'goods_receipt_lines',
  'goods_receipts',
  'stock_movements',
  'stock_balances',
  'product_components',
  'products',
  'stock_items',
  'color_palettes',
  'categories',
  'customers',
  'suppliers',
  'salespeople',
  'document_counters',
];

/**
 * Demo veritabanini bastan kurar. Temizleme ve yazma tek transaction'da: yarida
 * kalan bir sifirlama ziyaretciye bos bir sistem birakmaz, eski veri durur.
 *
 * `requireFlag`: Vercel'deki gece isi demo bayragini da ister; komut satiri
 * (`npm run db:demo`) bayraksiz calisir, yalnizca veritabani adina bakar.
 */
export async function resetDemo(db: Db, options: { requireFlag?: boolean } = {}): Promise<void> {
  await assertDemo(db, options);
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`));
    await seedDemo(tx as Tx);
  });
}
