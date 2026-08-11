import { PGlite } from '@electric-sql/pglite';
import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import { branches } from '@/db/schema';
import type { Db } from '@/db/types';
import { adminScope, branchScope, type Scope } from '@/domain/scope';

export interface TestDb {
  db: Db;
  /** S1 subesi. Testlerin cogu tek subeyle calisir; kisayol olarak burada. */
  scope: Scope;
  /** S1'in kimligi — ham `insert` yapan sema testleri icin. */
  branchId: string;
  /** Izolasyon testleri icin iki sube ve yonetici. */
  scopes: { s1: Scope; s2: Scope; admin: Scope };
  close: () => Promise<void>;
}

/**
 * Bellekte, gocleri uygulanmis, tamamen izole bir Postgres ornegi acar.
 * Her test dosyasi kendi ornegini acmali; testler arasi veri sizmaz.
 *
 * Sube kimlikleri her ornekte yeniden uretildigi icin kapsamlar da burada
 * kuruluyor — testler sabit bir UUID'ye guvenemez.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: 'snake_case' });
  await migrate(db, { migrationsFolder: './drizzle' });

  const rows = await db.select().from(branches).orderBy(asc(branches.code));
  const find = (code: string) => {
    const row = rows.find((entry) => entry.code === code);
    if (!row) throw new Error(`${code} subesi yok — 0004 gocu uygulanmadi mi?`);
    return branchScope(row.id, row.code);
  };

  const scopes = { s1: find('S1'), s2: find('S2'), admin: adminScope };

  return {
    db: db as unknown as Db,
    scope: scopes.s1,
    branchId: scopes.s1.kind === 'branch' ? scopes.s1.branchId : '',
    scopes,
    close: () => client.close(),
  };
}
