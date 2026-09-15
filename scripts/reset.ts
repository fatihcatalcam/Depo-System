import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { hardenSslMode } from '../src/db/connection-string';

/**
 * Tum is verisini siler, sema ve gocleri korur.
 *
 * `app_settings`, `branches` ve `salespeople` bilerek listede yok: bunlar is verisi degil
 * yapilandirmadir. Silinseydi yonetici parolasi, sube parolalari ve
 * ciktilarin ustundeki firma anteni de giderdi — katalogu yenilemek isteyen
 * biri bunlari kaybetmeyi kastetmiyor.
 */
const TABLES = [
  'delivery_lines',
  'deliveries',
  'payments',
  'order_line_components',
  'order_lines',
  'orders',
  'goods_receipt_lines',
  'goods_receipts',
  'stock_movements',
  'product_components',
  'products',
  'stock_items',
  'categories',
  'customers',
  'suppliers',
  'document_counters',
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tanimli degil.');

  const pool = new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL) });
  const db = drizzle(pool);

  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`));

  await pool.end();
  console.log(`${TABLES.length} tablo temizlendi.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
