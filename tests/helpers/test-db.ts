import { PGlite } from '@electric-sql/pglite';
import { asc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import { branches } from '@/db/schema';
import type { Db } from '@/db/types';
import { branchScope, type Scope } from '@/domain/scope';

export interface TestDb {
  db: Db;
  /** Merkez (S1). Testlerin cogu tek subeyle calisir; kisayol olarak burada. */
  scope: Scope;
  /** Merkezin kimligi — ham `insert` yapan sema testleri icin. */
  branchId: string;
  /** Merkezin bagli oldugu depo; stok fonksiyonlari bunu ister. */
  warehouseId: string;
  /** Izolasyon testleri icin iki sube: merkez ve sube 2. */
  scopes: { s1: Scope; s2: Scope };
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
    return branchScope(row.id, row.code, row.isCentral, row.stockBranchId);
  };

  const scopes = { s1: find('S1'), s2: find('S2') };

  return {
    db: db as unknown as Db,
    scope: scopes.s1,
    branchId: scopes.s1.branchId,
    warehouseId: scopes.s1.stockBranchId,
    scopes,
    close: () => client.close(),
  };
}
