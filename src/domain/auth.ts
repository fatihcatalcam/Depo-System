import { eq, sql } from 'drizzle-orm';
import { appSettings, branches } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { DomainError, NotFoundError } from '@/lib/errors';
import { adminScope, branchScope, type Scope } from './scope';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * Giris yapilabilecek hesap. Uc tane var: iki sube ve yonetici.
 *
 * Yoneticinin parolasi `app_settings` icinde durur — sube tablosuna
 * tasimadik, boylece mevcut parola yonetici parolasi olarak yerinde kaldi ve
 * gec sirasinda kimse disarida kalmadi.
 */
export type Account = { kind: 'admin' } | { kind: 'branch'; branchId: string };

export type LoginResult = { ok: true; scope: Scope } | { ok: false; lockedMinutes?: number };

interface Credential {
  passwordHash: string | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  /** Giris basarili olunca kurulacak kapsam. */
  scope: Scope;
}

async function readCredential(db: DbOrTx, account: Account): Promise<Credential> {
  if (account.kind === 'admin') {
    const [row] = await db
      .select({
        passwordHash: appSettings.passwordHash,
        failedAttempts: appSettings.failedAttempts,
        lockedUntil: appSettings.lockedUntil,
      })
      .from(appSettings)
      .where(eq(appSettings.id, 1));
    if (!row) throw new DomainError('Sistem ayarlari kurulmamis.', 'NOT_INITIALIZED');
    return { ...row, scope: adminScope };
  }

  const [row] = await db
    .select({
      code: branches.code,
      passwordHash: branches.passwordHash,
      failedAttempts: branches.failedAttempts,
      lockedUntil: branches.lockedUntil,
      isActive: branches.isActive,
    })
    .from(branches)
    .where(eq(branches.id, account.branchId));

  if (!row) throw new NotFoundError('Sube');
  if (!row.isActive) throw new DomainError('Bu sube kapali.', 'BRANCH_INACTIVE');
  return { ...row, scope: branchScope(account.branchId, row.code) };
}

type CredentialUpdate = Partial<Omit<Credential, 'scope'>>;

async function writeCredential(
  db: DbOrTx,
  account: Account,
  values: CredentialUpdate,
): Promise<void> {
  if (account.kind === 'admin') {
    await db
      .update(appSettings)
      .set({ ...values, updatedAt: sql`now()` })
      .where(eq(appSettings.id, 1));
    return;
  }
  await db
    .update(branches)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(branches.id, account.branchId));
}

/**
 * Parola dogrulama ve kilitlenme sayaci.
 *
 * Sayac hesap basina tutulur: bir subede parola bes kez yanlis girildi diye
 * diger sube ya da yonetici kapanmaz.
 */
export async function authenticate(
  db: DbOrTx,
  account: Account,
  password: string,
): Promise<LoginResult> {
  const credential = await readCredential(db, account);

  if (credential.lockedUntil && credential.lockedUntil > new Date()) {
    const remaining = Math.max(
      1,
      Math.ceil((credential.lockedUntil.getTime() - Date.now()) / 60_000),
    );
    return { ok: false, lockedMinutes: remaining };
  }

  const valid = credential.passwordHash
    ? await verifyPassword(password, credential.passwordHash)
    : false;

  if (valid) {
    await writeCredential(db, account, { failedAttempts: 0, lockedUntil: null });
    return { ok: true, scope: credential.scope };
  }

  const attempts = credential.failedAttempts + 1;
  const shouldLock = attempts >= MAX_ATTEMPTS;

  await writeCredential(db, account, {
    failedAttempts: shouldLock ? 0 : attempts,
    lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
  });

  return shouldLock ? { ok: false, lockedMinutes: LOCK_MINUTES } : { ok: false };
}

/**
 * Giris ekranindan gelen deneme.
 *
 * Yoneticinin ayri bir dugmesi yok; kendi parolasi var. Once secili subenin
 * parolasi denenir, tutmazsa yonetici parolasi denenir. Sube once deneniyor
 * cunku iki parola yanlislikla ayni olursa daha az yetkili olan kazanmali.
 *
 * Kilitlenme sayaci **yalnizca secili subede** tutulur. Yanlis deneme
 * yoneticinin sayacini da artirsaydi, subede bes kez yanlis yazan biri patronu
 * disarida birakirdi.
 *
 * Sube kilitliyse yonetici parolasi hic denenmez — denenseydi kilit, deneme
 * hakkini sinirsiz kilan bir bosluga donusurdu.
 */
export async function login(
  db: DbOrTx,
  branchId: string | null,
  password: string,
): Promise<LoginResult> {
  // Hicbir subenin parolasi yoksa (ilk kurulum) girilecek tek hesap yonetici.
  if (!branchId) return authenticate(db, { kind: 'admin' }, password);

  const account: Account = { kind: 'branch', branchId };
  const branch = await readCredential(db, account);

  if (branch.lockedUntil && branch.lockedUntil > new Date()) {
    const remaining = Math.max(1, Math.ceil((branch.lockedUntil.getTime() - Date.now()) / 60_000));
    return { ok: false, lockedMinutes: remaining };
  }

  if (branch.passwordHash && (await verifyPassword(password, branch.passwordHash))) {
    await writeCredential(db, account, { failedAttempts: 0, lockedUntil: null });
    return { ok: true, scope: branch.scope };
  }

  const admin = await readCredential(db, { kind: 'admin' });
  if (admin.passwordHash && (await verifyPassword(password, admin.passwordHash))) {
    await writeCredential(db, account, { failedAttempts: 0, lockedUntil: null });
    await writeCredential(db, { kind: 'admin' }, { failedAttempts: 0, lockedUntil: null });
    return { ok: true, scope: admin.scope };
  }

  const attempts = branch.failedAttempts + 1;
  const shouldLock = attempts >= MAX_ATTEMPTS;
  await writeCredential(db, account, {
    failedAttempts: shouldLock ? 0 : attempts,
    lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
  });

  return shouldLock ? { ok: false, lockedMinutes: LOCK_MINUTES } : { ok: false };
}

/**
 * Ekran kilidini acmak icin parola dogrulamasi.
 *
 * `admin`: yalnizca yonetici parolasi gecer (raporlar). Sube kendi
 * parolasiyla acabilseydi kilidin bir anlami kalmazdi.
 *
 * `own`: kendi sube parolasi ya da yonetici parolasi gecer (stok). Amac
 * yetki degil dikkat: depocu yanlislikla stok degistirmesin ama her
 * duzeltme icin patronu aramak zorunda da kalmasin.
 *
 * Kilitlenme sayaci isletilmiyor: burada yanlis yazmak kullanicinin
 * uygulamadan tamamen kilitlenmesine yol acmamali. Deneme hizini scrypt'in
 * kendi maliyeti sinirliyor.
 */
export async function verifyUnlockPassword(
  db: DbOrTx,
  scope: Scope,
  password: string,
  level: 'own' | 'admin',
): Promise<boolean> {
  const admin = await readCredential(db, { kind: 'admin' });
  if (admin.passwordHash && (await verifyPassword(password, admin.passwordHash))) return true;

  if (level === 'admin' || scope.kind !== 'branch') return false;

  const branch = await readCredential(db, { kind: 'branch', branchId: scope.branchId });
  return branch.passwordHash ? verifyPassword(password, branch.passwordHash) : false;
}

/** Hesabin kendi parolasini degistirmesi — mevcut parola sorulur. */
export async function changeOwnPassword(
  db: DbOrTx,
  account: Account,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 6) {
    throw new DomainError('Parola en az 6 karakter olmali.', 'WEAK_PASSWORD');
  }

  const credential = await readCredential(db, account);
  const valid = credential.passwordHash
    ? await verifyPassword(currentPassword, credential.passwordHash)
    : false;

  if (!valid) throw new DomainError('Mevcut parola hatali.', 'INVALID_PASSWORD');

  await writeCredential(db, account, {
    passwordHash: await hashPassword(newPassword),
    failedAttempts: 0,
    lockedUntil: null,
  });
}
