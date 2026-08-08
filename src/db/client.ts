import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { pool?: Pool };

// Gelistirmede havuzu globalThis uzerinde sakliyoruz; Next.js sicak yeniden
// yukleme yaptiginda her seferinde yeni havuz acip baglantilari tuketmesin diye.
const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;

export const db = drizzle(pool, { schema, casing: 'snake_case' });
