// Veritabaninin tamamini JSON olarak diske yazar.
//
// Gunluk otomatik yedek bulutta aliniyor (`/api/yedek`, Vercel Cron). Bu betik
// elle bir kopya icin: riskli bir goc ya da toplu silme oncesi.
//
// Kullanim: npm run db:backup [hedef-dosya]
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createDump, createPool, dumpSummary } from '../src/domain/backup';

async function main() {
  const target = resolve(
    process.argv[2] ?? `backups/depo-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );

  const pool = createPool();
  try {
    const dump = await createDump(pool);
    for (const row of dumpSummary(dump)) console.log(`${row.table}: ${row.rows} satir`);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(dump, null, 2), 'utf8');
    console.log(`\nYedek: ${target}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
