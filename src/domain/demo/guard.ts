import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db/types';
import { DEMO_DATABASE, isDemo } from '@/lib/demo';
import { DomainError } from '@/lib/errors';

/** Bagli olunan veritabani demo veritabani mi? */
export async function isDemoDatabase(db: DbOrTx): Promise<boolean> {
  // node-postgres ve PGlite ikisi de `{ rows }` donduruyor; Db tipi surucuden
  // bagimsiz oldugu icin donus tipi `unknown`.
  const result = (await db.execute(sql`select current_database() as name`)) as {
    rows: { name: string }[];
  };
  return result.rows[0]?.name === DEMO_DATABASE;
}

/**
 * Yalnizca demoda calisacak islemlerin kapisi: parolasiz giris ve gece
 * sifirlamasi. Bayrak tek basina yetmiyor; veritabaninin adi da `depo_demo`
 * olmali. Canli veritabani bu adi tasimadigi icin, bayrak yanlislikla canli
 * projeye girse bile buradan gecilemez.
 */
export async function assertDemo(db: DbOrTx, { requireFlag = true } = {}): Promise<void> {
  if (requireFlag && !isDemo()) {
    throw new DomainError('Bu işlem yalnızca demoda çalışır.', 'NOT_DEMO');
  }
  if (!(await isDemoDatabase(db))) {
    throw new DomainError(
      `Bu işlem yalnızca "${DEMO_DATABASE}" veritabanında çalışır.`,
      'NOT_DEMO_DATABASE',
    );
  }
}
