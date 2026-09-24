// Bu modul yalnizca sunucuda calisir. Bir istemci bileseni dolayli yoldan
// buraya ulasirsa derleme HATA verir — sessizce gecip tarayicida
// "The original argument must be of type Function" diye dusmez.
//
// Bir kez dustu: siparis modulu, parola ozetleme kodunu cagiran
// `domain/branches.ts`'den bir fonksiyon import ediyordu; bir istemci
// bileseni de siparis modulunden bir deger aliyordu. Zincir `node:crypto`ya
// kadar uzandi ve siparis detay sayfasi tarayicida acilmaz oldu.
import 'server-only';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// scrypt, node:crypto icinde hazir geliyor; bcrypt'in Windows'ta derlenme
// derdi olan yerel bagimliligina gerek kalmiyor.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;

/** Bicim: scrypt$<saltHex>$<hashHex> */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(plain, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  try {
    const salt = Buffer.from(parts[1], 'hex');
    const expected = Buffer.from(parts[2], 'hex');
    if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

    const derived = await scryptAsync(plain, salt, KEY_LENGTH);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
