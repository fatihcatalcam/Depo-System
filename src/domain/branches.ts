import { asc, eq, ne } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { appSettings, branches } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { DomainError, NotFoundError } from '@/lib/errors';

export type Branch = typeof branches.$inferSelect;

/** Parola ozeti ve kilitlenme sayaci disaridaki hicbir ekrana cikmaz. */
export interface BranchSummary {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  /** Parolasi belirlenmemis subeye giris yapilamaz; Ayarlar bunu uyari olarak gosterir. */
  hasPassword: boolean;
}

function toSummary(row: Branch): BranchSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    hasPassword: row.passwordHash !== null,
  };
}

export async function listBranches(db: DbOrTx): Promise<BranchSummary[]> {
  const rows = await db.select().from(branches).orderBy(asc(branches.code));
  return rows.map(toSummary);
}

/** Giris ekrani icin: yalnizca acik ve parolasi belirlenmis subeler. */
export async function listLoginableBranches(db: DbOrTx): Promise<BranchSummary[]> {
  const rows = await listBranches(db);
  return rows.filter((row) => row.isActive && row.hasPassword);
}

export async function getBranch(db: DbOrTx, id: string): Promise<Branch> {
  const [row] = await db.select().from(branches).where(eq(branches.id, id));
  if (!row) throw new NotFoundError('Sube');
  return row;
}

export async function renameBranch(db: DbOrTx, id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (trimmed === '') throw new DomainError('Sube adi bos olamaz.', 'INVALID_NAME');

  const result = await db
    .update(branches)
    .set({ name: trimmed, updatedAt: sql`now()` })
    .where(eq(branches.id, id))
    .returning({ id: branches.id });

  if (result.length === 0) throw new NotFoundError('Sube');
}

/**
 * Sube parolasini belirler veya degistirir.
 *
 * Yonetici islemidir; mevcut parola sorulmaz. Sube calisani parolasini
 * unuttugunda patron yenisini verebilsin diye boyle. Subenin kendi parolasini
 * degistirmesi `changeOwnBranchPassword` ile yapilir ve mevcut parolayi sorar.
 */
export async function setBranchPassword(
  db: DbOrTx,
  id: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 6) {
    throw new DomainError('Parola en az 6 karakter olmali.', 'WEAK_PASSWORD');
  }

  // Giriste once sube parolasi deneniyor. Sube parolasi yoneticininkiyle ayni
  // olursa yonetici hesabina bir daha ulasilamaz — sessizce izin veremeyiz.
  const [settings] = await db
    .select({ passwordHash: appSettings.passwordHash })
    .from(appSettings)
    .where(eq(appSettings.id, 1));

  if (settings?.passwordHash && (await verifyPassword(newPassword, settings.passwordHash))) {
    throw new DomainError(
      'Sube parolasi yonetici parolasiyla ayni olamaz; yonetici hesabina girilemez hale gelir.',
      'PASSWORD_COLLIDES_WITH_ADMIN',
    );
  }

  // Giriste sube secimi yok: parola hangi subeninse o sube aciliyor. Iki sube
  // ayni parolayi kullanirsa digerine bir daha girilemez.
  const others = await db.select().from(branches).where(ne(branches.id, id));
  for (const other of others) {
    if (other.passwordHash && (await verifyPassword(newPassword, other.passwordHash))) {
      throw new DomainError(
        `Bu parola "${other.name}" subesinde kullaniliyor; girişte subeler ayirt edilemez hale gelir.`,
        'PASSWORD_COLLIDES_WITH_BRANCH',
      );
    }
  }

  const result = await db
    .update(branches)
    .set({
      passwordHash: await hashPassword(newPassword),
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: sql`now()`,
    })
    .where(eq(branches.id, id))
    .returning({ id: branches.id });

  if (result.length === 0) throw new NotFoundError('Sube');
}
