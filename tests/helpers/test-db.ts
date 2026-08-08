import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import type { Db } from '@/db/types';

export interface TestDb {
  db: Db;
  close: () => Promise<void>;
}

/**
 * Bellekte, gocleri uygulanmis, tamamen izole bir Postgres ornegi acar.
 * Her test dosyasi kendi ornegini acmali; testler arasi veri sizmaz.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: './drizzle' });
  return {
    db: db as unknown as Db,
    close: () => client.close(),
  };
}
