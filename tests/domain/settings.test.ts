import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureSettings, getSettings, updateCompanyInfo } from '@/domain/settings';
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
    expect(settings.unlockPasswordHash).toBeTruthy();
  });

  it('ikinci cagri mevcut satiri bozmaz', async () => {
    const before = await getSettings(ctx.db);
    await ensureSettings(ctx.db, 'baskaparola');
    const after = await getSettings(ctx.db);
    expect(after.unlockPasswordHash).toBe(before.unlockPasswordHash);
  });

  it('firma bilgisi guncellenir', async () => {
    await updateCompanyInfo(ctx.db, { companyName: 'Ornek Mobilya', phone: '0555 000 00 00' });
    const settings = await getSettings(ctx.db);
    expect(settings.companyName).toBe('Ornek Mobilya');
    expect(settings.phone).toBe('0555 000 00 00');
  });
});
