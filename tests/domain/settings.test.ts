import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  attemptLogin,
  changePassword,
  ensureSettings,
  getSettings,
  updateCompanyInfo,
} from '@/domain/settings';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
  await ensureSettings(ctx.db, 'ilkparola');
});

afterAll(async () => {
  await ctx.close();
});

describe('ayarlar', () => {
  it('ilk cagrida tek satir olusturur', async () => {
    const settings = await getSettings(ctx.db);
    expect(settings.id).toBe(1);
    expect(settings.passwordHash).toBeTruthy();
  });

  it('ikinci cagri mevcut satiri bozmaz', async () => {
    const before = await getSettings(ctx.db);
    await ensureSettings(ctx.db, 'baskaparola');
    const after = await getSettings(ctx.db);
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('firma bilgisi guncellenir', async () => {
    await updateCompanyInfo(ctx.db, { companyName: 'Ornek Mobilya', phone: '0555 000 00 00' });
    const settings = await getSettings(ctx.db);
    expect(settings.companyName).toBe('Ornek Mobilya');
    expect(settings.phone).toBe('0555 000 00 00');
  });
});

describe('attemptLogin', () => {
  it('dogru parola basarili doner', async () => {
    expect(await attemptLogin(ctx.db, 'ilkparola')).toEqual({ ok: true });
  });

  it('yanlis parola basarisiz doner', async () => {
    expect(await attemptLogin(ctx.db, 'yanlis')).toEqual({ ok: false });
  });

  it('bes yanlis denemeden sonra hesap gecici kilitlenir', async () => {
    const fresh = await createTestDb();
    await ensureSettings(fresh.db, 'parola');

    for (let i = 0; i < 5; i += 1) {
      await attemptLogin(fresh.db, 'yanlis');
    }

    // Kilitliyken dogru parola bile kabul edilmez.
    const result = await attemptLogin(fresh.db, 'parola');
    expect(result).toMatchObject({ ok: false, lockedMinutes: expect.any(Number) });

    await fresh.close();
  });

  it('basarili giris hatali deneme sayacini sifirlar', async () => {
    const fresh = await createTestDb();
    await ensureSettings(fresh.db, 'parola');

    await attemptLogin(fresh.db, 'yanlis');
    await attemptLogin(fresh.db, 'yanlis');
    await attemptLogin(fresh.db, 'parola');

    expect((await getSettings(fresh.db)).failedAttempts).toBe(0);
    await fresh.close();
  });
});

describe('changePassword', () => {
  it('eski parola dogruysa degistirir', async () => {
    const fresh = await createTestDb();
    await ensureSettings(fresh.db, 'eski');

    await changePassword(fresh.db, 'eski', 'yenisifre');

    expect(await attemptLogin(fresh.db, 'yenisifre')).toEqual({ ok: true });
    await fresh.close();
  });

  it('eski parola yanlissa reddeder', async () => {
    const fresh = await createTestDb();
    await ensureSettings(fresh.db, 'eski');

    await expect(changePassword(fresh.db, 'hatali', 'yenisifre')).rejects.toThrow(
      'Mevcut parola hatali',
    );
    await fresh.close();
  });

  it('kisa parola reddedilir', async () => {
    const fresh = await createTestDb();
    await ensureSettings(fresh.db, 'eski');

    await expect(changePassword(fresh.db, 'eski', '123')).rejects.toThrow(
      'Parola en az 6 karakter olmali',
    );
    await fresh.close();
  });
});
