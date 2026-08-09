// Vercel CLI degiskenleri .env.local dosyasina yaziyor; dotenv varsayilan
// olarak sadece .env okur, ikisini de acikca veriyoruz.
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { hardenSslMode } from '../src/db/connection-string';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL tanimli degil. .env dosyasini kontrol edin.');
  }

  const pool = new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL) });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: './drizzle' });
  await pool.end();
  console.log('Gocler uygulandi.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
