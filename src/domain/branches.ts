import { asc, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { branches } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { assertPasswordFree } from '@/domain/auth';
import { hashPassword } from '@/lib/auth/password';
import { DomainError, NotFoundError } from '@/lib/errors';

export type Branch = typeof branches.$inferSelect;

/** Parola ozeti ve kilitlenme sayaci disaridaki hicbir ekrana cikmaz. */
export interface BranchSummary {
  id: string;
  code: string;
  name: string;
  /** Merkez sube: butun subelerin siparislerini ve cirosunu gorur. */
  isCentral: boolean;
  /** Bu subenin mallarinin durdugu depo; kendisi de olabilir. */
  stockBranchId: string;
  isActive: boolean;
  /** Parolasi belirlenmemis subeye giris yapilamaz; Ayarlar bunu uyari olarak gosterir. */
  hasPassword: boolean;
}

function toSummary(row: Branch): BranchSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isCentral: row.isCentral,
    stockBranchId: row.stockBranchId,
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
 * Merkez islemidir; mevcut parola sorulmaz. Sube calisani parolasini
 * unuttugunda patron yenisini verebilsin diye boyle. Subenin kendi parolasini
 * degistirmesi `changeOwnPassword` ile yapilir ve mevcut parolayi sorar.
 */
export async function setBranchPassword(
  db: DbOrTx,
  id: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 6) {
    throw new DomainError('Parola en az 6 karakter olmali.', 'WEAK_PASSWORD');
  }

  await assertPasswordFree(db, id, newPassword);

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
