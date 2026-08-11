// Veritabaninin tamamini JSON olarak diske yazar.
//
// pg_dump bu makinede yok; riskli bir goc oncesi elde tutulacak bir kopya icin
// bu yeterli. Cikti `restore.ts` ile geri yuklenebilir.
//
// Kullanim: npm run db:backup [hedef-dosya]
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { hardenSslMode } from '../src/db/connection-string';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL tanimli degil.');
  }

  const target = resolve(
    process.argv[2] ?? `backups/depo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );

  const pool = new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL) });

  const { rows: tables } = await pool.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );

  const dump: Record<string, unknown[]> = {};
  for (const { tablename } of tables) {
    // Tablo adlari pg_tables'tan geliyor, kullanicidan degil; yine de
    // tirnakliyoruz ki buyuk harfli ya da ayrilmis adlar patlamasin.
    const { rows } = await pool.query(`select * from "${tablename}"`);
    dump[tablename] = rows;
    console.log(`${tablename}: ${rows.length} satir`);
  }

  await pool.end();

  await mkdir(dirname(target), { recursive: true });
  await writeFile(
    target,
    JSON.stringify({ takenAt: new Date().toISOString(), tables: dump }, null, 2),
    'utf8',
  );

  console.log(`\nYedek: ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
