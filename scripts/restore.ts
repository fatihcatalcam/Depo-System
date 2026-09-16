// Yedegi geri yukler. MEVCUT VERININ TAMAMINI SILER ve yerine dosyadakini yazar.
//
// Kullanim:
//   npx tsx scripts/restore.ts backups/depo-....json --onayliyorum
//
// Buluttaki gunluk yedegi once indirin:
//   npx vercel blob list
//   npx vercel blob get <url> > yedek.json
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool, restoreDump, type Dump } from '../src/domain/backup';

const file = process.argv[2];

if (!file || !process.argv.includes('--onayliyorum')) {
  console.error(
    'Bu betik mevcut verinin tamamini siler.\n' +
      'Kullanim: npx tsx scripts/restore.ts <yedek.json> --onayliyorum',
  );
  process.exit(1);
}

async function main() {
  const dump = JSON.parse(await readFile(resolve(file), 'utf8')) as Dump;
  if (!dump.tables) throw new Error('Dosya bir yedek gibi gorunmuyor: "tables" alani yok.');

  console.log(`Yedek tarihi: ${dump.takenAt}`);

  const pool = createPool();
  try {
    const written = await restoreDump(pool, dump);
    for (const row of written) console.log(`  ${row.table.padEnd(24)} ${row.rows}`);
    console.log('\nGeri yukleme tamam.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
