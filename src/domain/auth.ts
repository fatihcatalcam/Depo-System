import { asc, eq, sql } from 'drizzle-orm';
import { appSettings, branches } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { DomainError, NotFoundError } from '@/lib/errors';
import { adminScope, branchScope, type Scope } from './scope';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

/**
 * Giris ekraninin kilit suresi, hesap kilidinden kisa.
 *
 * Sube secimi kalkinca parolayi kimin yazdigini bilemiyoruz; sayac tek ve
 * hatali denemeler girisin tamamini kilitliyor. Artik bir kisinin yanlis
 * yazmasi herkesi disarida biraktigi icin kilidin bedeli agirlasti, suresini
 * kisalttik. Denemeyi asil yavaslatan zaten scrypt'in maliyeti.
 */
const LOGIN_LOCK_MINUTES = 5;

/**
 * Giris yapilabilecek hesap. Uc tane var: iki sube ve yonetici.
 *
 * Yoneticinin parolasi `app_settings` icinde durur — sube tablosuna
 * tasimadik, boylece mevcut parola yonetici parolasi olarak yerinde kaldi ve
 * gec sirasinda kimse disarida kalmadi.
 */
export type Account = { kind: 'admin' } | { kind: 'branch'; branchId: string };

export type LoginResult =
  | { ok: true; scope: Scope }
  /**
   * `ambiguous`: parola birden fazla hesapta tanimli, hangisi oldugu
   * ayirt edilemiyor. Parola yanlis degil — giris ekrani bunu hatali
   * deneme gibi degil, duzeltilmesi gereken bir kurulum hatasi gibi
   * anlatmali.
   */
  | { ok: false; lockedMinutes?: number; ambiguous?: true };

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

export interface AccountMatch {
  /** Insana gosterilecek ad: "Sube 1 (S1)" ya da "Yonetici". */
  label: string;
  scope: Scope;
}

/**
 * Parolanin eslestigi hesaplar.
 *
 * Giris de, `scripts/hesaplar.ts` teshis araci da bunu kullaniyor: "bu parola
 * hangi hesabi aciyor" sorusunun cevabi tek yerde dursun, arac ile gercek
 * davranis birbirinden ayrilmasin.
 *
 * Kapali subeler disarida: giris onlari zaten acmiyor.
 */
export async function matchAccounts(db: DbOrTx, password: string): Promise<AccountMatch[]> {
  const rows = await db
    .select({
      id: branches.id,
      code: branches.code,
      name: branches.name,
      passwordHash: branches.passwordHash,
    })
    .from(branches)
    .where(eq(branches.isActive, true))
    .orderBy(asc(branches.code));

  const matches: AccountMatch[] = [];

  for (const row of rows) {
    if (row.passwordHash && (await verifyPassword(password, row.passwordHash))) {
      matches.push({ label: `${row.name} (${row.code})`, scope: branchScope(row.id, row.code) });
    }
  }

  const [settings] = await db
    .select({ passwordHash: appSettings.passwordHash })
    .from(appSettings)
    .where(eq(appSettings.id, 1));

  if (settings?.passwordHash && (await verifyPassword(password, settings.passwordHash))) {
    matches.push({ label: 'Yonetici', scope: adminScope });
  }

  return matches;
}

/**
 * Giris ekranindan gelen deneme.
 *
 * Sube secimi yok: parola hangi hesabinsa o hesap acilir. Bu yuzden parola
 * hesabin tek isareti — ayni parola iki hesapta duruyorsa hangisine
 * girilecegi belirlenemez.
 *
 * Boyle bir durumda **tahmin etmiyoruz**: butun hesaplar denenir, birden
 * fazlasi eslesirse giris `ambiguous` ile reddedilir. Eskiden ilk eslesen
 * (kod sirasina gore en kucuk sube) aciliyordu; iki sube ayni parolayi
 * kullaninca herkes S1'e giriyor, ikinci subenin siparisleri birincinin
 * defterine yaziliyor ve iki sube birbirinin siparisini goruyordu. Sessiz
 * yanlis hesap, kapali girisden kotudur.
 *
 * `setBranchPassword` ayni parolayi bugun reddediyor ama kontrol sonradan
 * eklendi; once yazilmis kayitlar hala cakisabilir. Kontrol burada da var.
 *
 * Kilitlenme sayaci tek: kimin denedigini bilmedigimiz icin hesap basina
 * sayac tutulamiyor. Bes hatali denemeden sonra giris `LOGIN_LOCK_MINUTES`
 * boyunca hepsine kapanir. Cakisma hatali deneme sayilmaz: parola dogru,
 * kusur kurulumda.
 */
export async function login(db: DbOrTx, password: string): Promise<LoginResult> {
  const admin = await readCredential(db, { kind: 'admin' });

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    const remaining = Math.max(1, Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 60_000));
    return { ok: false, lockedMinutes: remaining };
  }

  // Ilk eslesmede durmuyoruz: cakisma ancak hepsi denenince goruluyor.
  const matches = await matchAccounts(db, password);

  if (matches.length > 1) {
    await clearLoginLock(db);
    return { ok: false, ambiguous: true };
  }

  if (matches.length === 1) {
    await clearLoginLock(db);
    return { ok: true, scope: matches[0].scope };
  }

  const attempts = admin.failedAttempts + 1;
  const shouldLock = attempts >= MAX_ATTEMPTS;
  await writeCredential(db, { kind: 'admin' }, {
    failedAttempts: shouldLock ? 0 : attempts,
    lockedUntil: shouldLock ? new Date(Date.now() + LOGIN_LOCK_MINUTES * 60_000) : null,
  });

  return shouldLock ? { ok: false, lockedMinutes: LOGIN_LOCK_MINUTES } : { ok: false };
}

async function clearLoginLock(db: DbOrTx): Promise<void> {
  await writeCredential(db, { kind: 'admin' }, { failedAttempts: 0, lockedUntil: null });
}

/**
 * Ekran kilidini acmak icin parola dogrulamasi.
 *
 * `admin`: yalnizca yonetici parolasi gecer (raporlar). Sube kendi
 * parolasiyla acabilseydi kilidin bir anlami kalmazdi.
 *
 * `own`: kendi sube parolasi ya da yonetici parolasi gecer. Su an hicbir
 * ekran bu seviyeyi kullanmiyor — stok da yonetici parolasina baglandi —
 * ama secim politikadan ibaret, kod tarafi duruyor.
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
