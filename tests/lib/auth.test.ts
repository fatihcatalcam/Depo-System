import { SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSessionToken, verifySessionToken } from '@/lib/auth/session';

beforeAll(() => {
  process.env.SESSION_SECRET = 'test-icin-en-az-otuz-iki-karakterlik-gizli-anahtar';
});

describe('parola', () => {
  it('ozet her seferinde farklidir', async () => {
    const first = await hashPassword('depo2026');
    const second = await hashPassword('depo2026');
    expect(first).not.toBe(second);
  });

  it('dogru parola dogrulanir', async () => {
    const hash = await hashPassword('depo2026');
    expect(await verifyPassword('depo2026', hash)).toBe(true);
  });

  it('yanlis parola reddedilir', async () => {
    const hash = await hashPassword('depo2026');
    expect(await verifyPassword('depo2027', hash)).toBe(false);
  });

  it('bozuk ozet formatinda cokmez, false doner', async () => {
    expect(await verifyPassword('depo2026', 'gecersiz-ozet')).toBe(false);
    expect(await verifyPassword('depo2026', '')).toBe(false);
    expect(await verifyPassword('depo2026', 'scrypt$zz$zz')).toBe(false);
  });
});

const BRANCH_ID = '11111111-1111-1111-1111-111111111111';

describe('oturum jetonu', () => {
  it('uretilen jeton dogrulanir', async () => {
    const token = await createSessionToken({ role: 'branch', branchId: BRANCH_ID });
    expect(await verifySessionToken(token)).toBe(true);
  });

  it('kurcalanmis jeton reddedilir', async () => {
    const token = await createSessionToken({ role: 'branch', branchId: BRANCH_ID });
    expect(await verifySessionToken(`${token}x`)).toBe(false);
  });

  /**
   * Yonetici hesabi kaldirildi. O hesapla acilmis eski bir jeton hala imzali
   * olabilir; sessizce kabul edilirse kapsamsiz bir oturum dogar.
   */
  it('kaldirilmis yonetici jetonu reddedilir', async () => {
    const token = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET as string));

    expect(await verifySessionToken(token)).toBe(false);
  });

  it('bos ve tanimsiz jeton reddedilir', async () => {
    expect(await verifySessionToken('')).toBe(false);
    expect(await verifySessionToken(undefined)).toBe(false);
  });

  it('baska bir anahtarla imzalanmis jeton reddedilir', async () => {
    const token = await createSessionToken({ role: 'branch', branchId: BRANCH_ID });
    const original = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'bambaska-bir-anahtar-en-az-otuz-iki-karakter';
    const result = await verifySessionToken(token);
    process.env.SESSION_SECRET = original;
    expect(result).toBe(false);
  });
});
