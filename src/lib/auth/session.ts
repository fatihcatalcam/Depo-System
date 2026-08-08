import { SignJWT, jwtVerify } from 'jose';

export const SESSION_COOKIE = 'depo_oturum';
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
 * Jetonun icine rol bilgisi koyuyoruz. Bugun tek rol var, ama ileride rol
 * eklendiginde mevcut oturumlar gecerli kalsin ve kontrol noktasi hazir olsun.
 */
export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'staff' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}
