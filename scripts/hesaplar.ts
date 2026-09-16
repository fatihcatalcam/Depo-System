// Hesap durumu (teshis araci).
//
// "Siparis neden diger subede de gorunuyor?" sorusunun cevabi neredeyse her
// zaman girilen hesaptir: giriste sube secimi yok, parola hangi hesabinsa o
// hesap acilir ve yonetici hesabi butun subelerin siparislerini gorur.
//
// Kullanim:
//   npx tsx scripts/hesaplar.ts            -> hesaplarin durumu
//   npx tsx scripts/hesaplar.ts <parola>   -> bu parola hangi hesabi aciyor
//
// Parolayi komut satirina yazmak kabuk gecmisine dusurur; is bitince gecmisi
// temizlemek iyi olur.
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../src/db/schema';
import type { Db } from '../src/db/types';
import { hardenSslMode } from '../src/db/connection-string';
import { matchAccounts } from '../src/domain/auth';
import { getAccountOverview } from '../src/domain/branches';

const [password] = process.argv.slice(2);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL tanimli degil.');
  process.exit(1);
}

const pool = new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL) });
const db = drizzle(pool, { schema, casing: 'snake_case' }) as unknown as Db;

async function main() {
  const overview = await getAccountOverview(db);

  console.log('\nHesaplar');
  console.log(`  ${'Yonetici'.padEnd(22)}parola: ${overview.adminHasPassword ? 'var' : 'YOK'}`);

  for (const branch of overview.branches) {
    const name = `${branch.code} ${branch.name}${branch.isActive ? '' : ' (kapali)'}`;
    console.log(
      `  ${name.padEnd(22)}` +
        `parola: ${branch.hasPassword ? 'var' : 'YOK'}   ` +
        `siparis: ${String(branch.orderCount).padStart(4)}   ` +
        `musteri: ${String(branch.customerCount).padStart(4)}`,
    );
  }

  const passwordless = overview.branches.filter((b) => b.isActive && !b.hasPassword);
  if (passwordless.length > 0) {
    console.log(
      `\nUYARI: ${passwordless.map((b) => b.name).join(', ')} icin parola belirlenmemis.\n` +
        '       O subeye giris yapilamiyor; calisani baska bir hesabin parolasiyla\n' +
        '       giriyorsa siparisleri o hesabin defterine yaziliyor.',
    );
  }

  if (password) {
    const matches = await matchAccounts(db, password);

    console.log('\nVerilen parola hangi hesabi aciyor?');

    if (matches.length === 0) {
      console.log('  Hicbiri — bu parola hicbir acik hesapta tanimli degil.');
    } else if (matches.length > 1) {
      console.log(`  Birden fazlasi: ${matches.map((m) => m.label).join(', ')}`);
      console.log('  Bu parolayla giris yapilamaz; her hesaba ayri bir parola verin.');
    } else {
      console.log(`  ${matches[0].label}`);
      if (matches[0].scope.kind === 'admin') {
        console.log(
          '\n  DIKKAT: Yonetici hesabi butun subelerin siparislerini gorur ve kendisi\n' +
            '          siparis olusturamaz. Bir sube calisani bu parolayla giriyorsa,\n' +
            '          gordugu liste iki subenin siparislerinin toplamidir — aradigin\n' +
            '          "diger subenin siparisi gorunuyor" durumu budur.',
        );
      }
    }
  }

  console.log('');
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
