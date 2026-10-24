// Demo veritabanini bastan kurar: uydurma katalog, musteriler, siparisler.
//
// Kullanim (demo veritabaninin adresiyle):
//   DATABASE_URL=postgres://.../depo_demo npm run db:demo
//
// Canli veritabanina yazamaz: veritabaninin adi "depo_demo" degilse hicbir
// seye dokunmadan durur. Vercel'deki gece isi (/api/demo-sifirla) ayni
// fonksiyonu cagiriyor.
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { hardenSslMode } from '../src/db/connection-string';
import * as schema from '../src/db/schema';
import type { Db } from '../src/db/types';
import { resetDemo } from '../src/domain/demo/reset';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tanımlı değil.');

  const pool = new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL) });
  const db = drizzle(pool, { schema, casing: 'snake_case' }) as unknown as Db;

  try {
    await resetDemo(db, { requireFlag: false });
  } finally {
    await pool.end();
  }

  console.log('Demo verisi yüklendi: 10 müşteri, 12 sipariş, 46 stok kartı.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
