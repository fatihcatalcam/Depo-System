import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { Scope } from '@/domain/scope';

/**
 * Ekran kilitleri.
 *
 * Iki ayri ihtiyac var:
 *  - **Stok**: yanlislikla degistirmeyi onlemek. Kullanici kendisi kilitler,
 *    acmak icin yonetici parolasi gerekir. Kilitlemek serbest, acmak degil.
 *  - **Raporlar**: ciro, tahsilat ve alacak yalnizca yoneticiye acik. Sube
 *    kendi parolasiyla acamaz, yoksa kilidin bir anlami kalmazdi.
 */
export type LockArea = 'stok' | 'raporlar';

/** Bir kez acilinca ne kadar acik kalir. */
const UNLOCK_MINUTES = 15;

const UNLOCK_COOKIE: Record<LockArea, string> = {
  stok: 'depo_acik_stok',
  raporlar: 'depo_acik_raporlar',
};

/**
 * Kullanicinin stok kilidini acikca actigini gosteren cerez. Kilit varsayilan
 * olarak kapali degil: kullanici kilitleyene kadar stok duzenlenebilir.
 */
const STOCK_LOCKED_COOKIE = 'depo_stok_kilitli';

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('SESSION_SECRET tanimli degil veya 32 karakterden kisa.');
  }
  return new TextEncoder().encode(value);
}

/**
 * Jeton kapsama baglaniyor: bir subede acilan kilit, ayni tarayicida baska
 * bir subeye giris yapildiginda acik sayilmamali.
 */
function scopeKey(scope: Scope): string {
  return scope.kind === 'admin' ? 'admin' : scope.branchId;
}

export async function issueUnlockToken(area: LockArea, scope: Scope): Promise<string> {
  return new SignJWT({ area, sub: scopeKey(scope) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${UNLOCK_MINUTES}m`)
    .sign(secret());
}

async function hasValidUnlock(area: LockArea, scope: Scope): Promise<boolean> {
  const store = await cookies();
  const token = store.get(UNLOCK_COOKIE[area])?.value;
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.area === area && payload.sub === scopeKey(scope);
  } catch {
    // Suresi dolmus ya da kurcalanmis jeton: kilitli say.
    return false;
  }
}

export async function setUnlockCookie(area: LockArea, scope: Scope): Promise<void> {
  const store = await cookies();
  store.set(UNLOCK_COOKIE[area], await issueUnlockToken(area, scope), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: UNLOCK_MINUTES * 60,
  });
}

/** Raporlar her zaman kilitli; yalnizca gecerli bir acma jetonu gecirir. */
export async function isReportsUnlocked(scope: Scope): Promise<boolean> {
  return hasValidUnlock('raporlar', scope);
}

/**
 * Stok kilidi acik mi?
 *
 * Kilitli sayilmasi icin iki sart: kullanici kilidi acmis olmali **ve**
 * gecerli bir acma jetonu bulunmamali. Jetonun suresi dolunca kendiliginden
 * yeniden kilitlenir — telefon masada unutuldugunda acik kalmasin diye.
 */
export async function isStockLocked(scope: Scope): Promise<boolean> {
  const store = await cookies();
  if (store.get(STOCK_LOCKED_COOKIE)?.value !== '1') return false;
  return !(await hasValidUnlock('stok', scope));
}

export async function lockStock(): Promise<void> {
  const store = await cookies();
  store.set(STOCK_LOCKED_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
  // Acik jeton varsa dusuyor: "kilitle" dedigi anda kilitlenmeli.
  store.delete(UNLOCK_COOKIE.stok);
}

/** Kilidi tamamen kaldirir (kullanici kilidi kapatti). */
export async function clearStockLock(): Promise<void> {
  const store = await cookies();
  store.delete(STOCK_LOCKED_COOKIE);
  store.delete(UNLOCK_COOKIE.stok);
}

export const UNLOCK_MINUTES_LABEL = `${UNLOCK_MINUTES} dakika`;
