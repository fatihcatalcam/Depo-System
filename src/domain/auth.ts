import { asc, eq, ne, sql } from 'drizzle-orm';
import { appSettings, branches } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { DomainError, NotFoundError } from '@/lib/errors';
import { branchScope, type Scope } from './scope';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * Giris ekraninin kilit suresi, hesap kilidinden kisa.
 *
 * Sube secimi yok; parolayi kimin yazdigini bilemiyoruz, sayac tek ve hatali
 * denemeler girisin tamamini kilitliyor. Bir kisinin yanlis yazmasi herkesi
 * disarida biraktigi icin kilidin bedeli agir, suresi kisa. Denemeyi asil
 * yavaslatan zaten scrypt'in maliyeti.
 */
const LOGIN_LOCK_MINUTES = 5;

export type LoginResult = { ok: true; scope: Scope } | { ok: false; lockedMinutes?: number };

interface Credential {
  passwordHash: string | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  /** Giris basarili olunca kurulacak kapsam. */
  scope: Scope;
}

type CredentialUpdate = {
  passwordHash?: string;
  failedAttempts?: number;
  lockedUntil?: Date | null;
};

async function readCredential(db: DbOrTx, branchId: string): Promise<Credential> {
  const [row] = await db
    .select({
      code: branches.code,
      isCentral: branches.isCentral,
      stockBranchId: branches.stockBranchId,
      passwordHash: branches.passwordHash,
      failedAttempts: branches.failedAttempts,
      lockedUntil: branches.lockedUntil,
      isActive: branches.isActive,
    })
    .from(branches)
    .where(eq(branches.id, branchId));

  if (!row) throw new NotFoundError('Sube');
  if (!row.isActive) throw new DomainError('Bu sube kapali.', 'BRANCH_INACTIVE');
  return {
    ...row,
    scope: branchScope(branchId, row.code, row.isCentral, row.stockBranchId),
  };
}

async function writeCredential(
  db: DbOrTx,
  branchId: string,
  values: CredentialUpdate,
): Promise<void> {
  await db
    .update(branches)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(branches.id, branchId));
}

/**
 * Parola dogrulama ve kilitlenme sayaci.
 *
 * Sayac sube basina tutulur: bir subede parola bes kez yanlis girildi diye
 * digeri kapanmaz.
 */
export async function authenticate(
  db: DbOrTx,
  branchId: string,
  password: string,
): Promise<LoginResult> {
  const credential = await readCredential(db, branchId);

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
    await writeCredential(db, branchId, { failedAttempts: 0, lockedUntil: null });
    return { ok: true, scope: credential.scope };
  }

  const attempts = credential.failedAttempts + 1;
  const shouldLock = attempts >= MAX_ATTEMPTS;

  await writeCredential(db, branchId, {
    failedAttempts: shouldLock ? 0 : attempts,
    lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
  });

  return shouldLock ? { ok: false, lockedMinutes: LOCK_MINUTES } : { ok: false };
}

/**
 * Giris ekranindan gelen deneme.
 *
 * Sube secimi yok: parola hangi subeninse o sube acilir. Girilebilecek tek
 * hesap turu sube — stok ve rapor kilidini acan parola buraya **girmez**.
 * Bir zamanlar giriyordu: ayni ozet hem yonetici girisiydi hem kilit
 * parolasiydi, dolayisiyla kilidi acsin diye verilen parola giris ekraninda
 * iki subeyi birden aciyordu. Yonetici hesabi bu yuzden kaldirildi.
 *
 * Kilitlenme sayaci tek ve `app_settings` uzerinde: kimin denedigini
 * bilmedigimiz icin hesap basina sayac tutulamiyor. Bes hatali denemeden
 * sonra giris `LOGIN_LOCK_MINUTES` boyunca hepsine kapanir.
 */
export async function login(db: DbOrTx, password: string): Promise<LoginResult> {
  const [gate] = await db
    .select({ failedAttempts: appSettings.failedAttempts, lockedUntil: appSettings.lockedUntil })
    .from(appSettings)
    .where(eq(appSettings.id, 1));

  if (!gate) throw new DomainError('Sistem ayarlari kurulmamis.', 'NOT_INITIALIZED');

  if (gate.lockedUntil && gate.lockedUntil > new Date()) {
    const remaining = Math.max(1, Math.ceil((gate.lockedUntil.getTime() - Date.now()) / 60_000));
    return { ok: false, lockedMinutes: remaining };
  }

  const rows = await db
    .select({
      id: branches.id,
      code: branches.code,
      isCentral: branches.isCentral,
      stockBranchId: branches.stockBranchId,
      passwordHash: branches.passwordHash,
    })
    .from(branches)
    .where(eq(branches.isActive, true))
    .orderBy(asc(branches.code));

  for (const row of rows) {
    if (row.passwordHash && (await verifyPassword(password, row.passwordHash))) {
      await writeLoginGate(db, { failedAttempts: 0, lockedUntil: null });
      return {
        ok: true,
        scope: branchScope(row.id, row.code, row.isCentral, row.stockBranchId),
      };
    }
  }

  const attempts = gate.failedAttempts + 1;
  const shouldLock = attempts >= MAX_ATTEMPTS;
  await writeLoginGate(db, {
    failedAttempts: shouldLock ? 0 : attempts,
    lockedUntil: shouldLock ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000) : null,
  });

  return shouldLock ? { ok: false, lockedMinutes: LOGIN_LOCK_MINUTES } : { ok: false };
}

async function writeLoginGate(
  db: DbOrTx,
  values: { failedAttempts: number; lockedUntil: Date | null },
): Promise<void> {
  await db
    .update(appSettings)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(appSettings.id, 1));
}

/**
 * Stok ve rapor kilidini acmak icin parola dogrulamasi.
 *
 * Yalnizca kilit parolasi gecer. Sube kendi parolasiyla acabilseydi kilidin
 * bir anlami kalmazdi — telefon zaten o subenin hesabiyla acik.
 *
 * Kilitlenme sayaci isletilmiyor: burada yanlis yazmak kullanicinin
 * uygulamadan tamamen kilitlenmesine yol acmamali. Deneme hizini scrypt'in
 * kendi maliyeti sinirliyor.
 */
export async function verifyUnlockPassword(db: DbOrTx, password: string): Promise<boolean> {
  const [settings] = await db
    .select({ hash: appSettings.unlockPasswordHash })
    .from(appSettings)
    .where(eq(appSettings.id, 1));

  return settings?.hash ? verifyPassword(password, settings.hash) : false;
}

/**
 * Stok ve rapor kilidinin parolasini belirler. Merkez islemidir.
 *
 * Hicbir subenin giris parolasiyla ayni olamaz: olsaydi o subenin calisani
 * kilidi kendi parolasiyla acar, kilit anlamsizlasirdi.
 */
export async function setUnlockPassword(db: DbOrTx, newPassword: string): Promise<void> {
  if (newPassword.length < 6) {
    throw new DomainError('Parola en az 6 karakter olmali.', 'WEAK_PASSWORD');
  }

  const rows = await db
    .select({ name: branches.name, passwordHash: branches.passwordHash })
    .from(branches);

  for (const row of rows) {
    if (row.passwordHash && (await verifyPassword(newPassword, row.passwordHash))) {
      throw new DomainError(
        `Bu parola "${row.name}" subesinin giris parolasi; o subenin calisani kilidi kendi parolasiyla acabilir hale gelir.`,
        'PASSWORD_COLLIDES_WITH_BRANCH',
      );
    }
  }

  const result = await db
    .update(appSettings)
    .set({ unlockPasswordHash: await hashPassword(newPassword), updatedAt: sql`now()` })
    .where(eq(appSettings.id, 1))
    .returning({ id: appSettings.id });

  if (result.length === 0) throw new DomainError('Sistem ayarlari kurulmamis.', 'NOT_INITIALIZED');
}

/** Subenin kendi parolasini degistirmesi — mevcut parola sorulur. */
export async function changeOwnPassword(
  db: DbOrTx,
  branchId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 6) {
    throw new DomainError('Parola en az 6 karakter olmali.', 'WEAK_PASSWORD');
  }

  const credential = await readCredential(db, branchId);
  const valid = credential.passwordHash
    ? await verifyPassword(currentPassword, credential.passwordHash)
    : false;

  if (!valid) throw new DomainError('Mevcut parola hatali.', 'INVALID_PASSWORD');

  await assertPasswordFree(db, branchId, newPassword);

  await writeCredential(db, branchId, {
    passwordHash: await hashPassword(newPassword),
    failedAttempts: 0,
    lockedUntil: null,
  });
}

/**
 * Yeni bir sube parolasinin baska bir yerde kullanilmadigini dogrular.
 *
 * Giriste sube secimi olmadigi icin iki sube ayni parolayi kullanirsa
 * digerine bir daha girilemez; kilit parolasiyla ayni olursa da calisan
 * kilidi kendi parolasiyla acar. `setBranchPassword` ile ortak kullaniliyor.
 */
export async function assertPasswordFree(
  db: DbOrTx,
  branchId: string,
  password: string,
): Promise<void> {
  const [settings] = await db
    .select({ hash: appSettings.unlockPasswordHash })
    .from(appSettings)
    .where(eq(appSettings.id, 1));

  if (settings?.hash && (await verifyPassword(password, settings.hash))) {
    throw new DomainError(
      'Bu parola stok ve rapor kilidini aciyor; giris parolasi olarak kullanilamaz.',
      'PASSWORD_COLLIDES_WITH_UNLOCK',
    );
  }

  const others = await db
    .select({ name: branches.name, passwordHash: branches.passwordHash })
    .from(branches)
    .where(ne(branches.id, branchId));

  for (const other of others) {
    if (other.passwordHash && (await verifyPassword(password, other.passwordHash))) {
      throw new DomainError(
        `Bu parola "${other.name}" subesinde kullaniliyor; giriste subeler ayirt edilemez hale gelir.`,
        'PASSWORD_COLLIDES_WITH_BRANCH',
      );
    }
  }
}
