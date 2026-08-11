import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'depo_oturum';
/** Giris ekraninda son secilen hesabi hatirlar. Gizli bir sey icermez. */
export const LAST_ACCOUNT_COOKIE = 'depo_son_hesap';

const SESSION_DAYS = 30;

export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 24 * 60 * 60;

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('SESSION_SECRET tanimli degil veya 32 karakterden kisa.');
  }
  return new TextEncoder().encode(value);
}

/**
 * Oturumun tasidigi bilgi.
 *
 * Sube **adi** bilerek jetona konmuyor: konsaydi sube yeniden adlandirildiginda
 * herkesin yeniden giris yapmasi gerekirdi. Ad her istekte veritabanindan
 * okunuyor.
 */
export type SessionPayload = { role: 'admin' } | { role: 'branch'; branchId: string };

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

/** Jeton gecerliyse icerigini, degilse null doner. */
export async function readSessionToken(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());

    if (payload.role === 'admin') return { role: 'admin' };
    if (payload.role === 'branch' && typeof payload.branchId === 'string') {
      return { role: 'branch', branchId: payload.branchId };
    }
    return null;
  } catch {
    return null;
  }
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  return (await readSessionToken(token)) !== null;
}
