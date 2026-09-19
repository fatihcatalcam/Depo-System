// Parola belirleme (acil durum araci).
//
// Arayuzden parola degistirmek mevcut parolayi sorar. Parola unutuldugunda
// oradan cikis yok; bu betik ozeti dogrudan yaziyor. Sunucuya erisebilen
// zaten veritabanina da erisebiliyor, dolayisiyla yeni bir acik yaratmiyor.
//
// Kullanim:
//   npx tsx scripts/set-password.ts S1 <parola>
//   npx tsx scripts/set-password.ts kilit <parola>     (stok ve rapor kilidi)
//
// Parolayi komut satirina yazmak kabuk gecmisine dusurur; is bitince
// gecmisi temizlemek iyi olur.
import { config } from 'dotenv';
config({ path: ['.env.local', '.env'] });

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { appSettings, branches } from '../src/db/schema';
import { hardenSslMode } from '../src/db/connection-string';
import { hashPassword, verifyPassword } from '../src/lib/auth/password';

const [target, password] = process.argv.slice(2);

if (!target || !password) {
  console.error('Kullanim: npx tsx scripts/set-password.ts <sube-kodu|kilit> <parola>');
  process.exit(1);
}
if (password.length < 6) {
  console.error('Parola en az 6 karakter olmali.');
  process.exit(1);
}

const pool = new Pool({ connectionString: hardenSslMode(process.env.DATABASE_URL) });
const db = drizzle(pool, { schema: { appSettings, branches }, casing: 'snake_case' });

async function main() {
  const hash = await hashPassword(password);
  const isUnlock = target.toLowerCase() === 'kilit';

  // Giriste sube secimi yok: parola hangi subeninse o sube aciliyor. Ayni
  // parolayi iki subeye vermek, birine bir daha girilememesi demek. Kilit
  // parolasiyla cakismasi ise calisanin kilidi kendi parolasiyla acmasi.
  const branchRows = await db.select().from(branches);
  const [settings] = await db.select().from(appSettings).where(eq(appSettings.id, 1));

  const clashes = [
    ...branchRows
      .filter((row) => isUnlock || row.code !== target)
      .map((row) => ({ label: `${row.name} (${row.code})`, hash: row.passwordHash })),
    ...(isUnlock
      ? []
      : [{ label: 'stok ve rapor kilidi', hash: settings?.unlockPasswordHash ?? null }]),
  ];

  for (const other of clashes) {
    if (other.hash && (await verifyPassword(password, other.hash))) {
      console.error(`Bu parola zaten "${other.label}" icin kullaniliyor.`);
      process.exit(1);
    }
  }

  if (isUnlock) {
    await db
      .update(appSettings)
      .set({ unlockPasswordHash: hash, updatedAt: sql`now()` })
      .where(eq(appSettings.id, 1));
    console.log('Stok ve rapor kilidi parolasi guncellendi.');
  } else {
    const updated = await db
      .update(branches)
      .set({ passwordHash: hash, failedAttempts: 0, lockedUntil: null, updatedAt: sql`now()` })
      .where(eq(branches.code, target))
      .returning({ name: branches.name });

    if (updated.length === 0) {
      console.error(`"${target}" kodlu sube yok.`);
      process.exit(1);
    }
    console.log(`${updated[0].name} parolasi guncellendi.`);
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
