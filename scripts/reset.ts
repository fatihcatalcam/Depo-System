import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

/**
 * Tum is verisini siler, sema ve gocleri korur. Demo/gelistirme icindir.
 * Uretim veritabaninda calistirmayin.
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
  'app_settings',
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tanimli degil.');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`));

  await pool.end();
  console.log(`${TABLES.length} tablo temizlendi.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
