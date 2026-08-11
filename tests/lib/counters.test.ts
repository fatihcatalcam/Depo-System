import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nextDocumentNumber } from '@/lib/counters';
import { createTestDb, type TestDb } from '../helpers/test-db';

let ctx: TestDb;

beforeAll(async () => {
  ctx = await createTestDb();
});

afterAll(async () => {
  await ctx.close();
});

describe('nextDocumentNumber', () => {
  it('ortak tipte sirali numara uretir', async () => {
    expect(await nextDocumentNumber(ctx.db, 'stockItem')).toBe('SK-00001');
    expect(await nextDocumentNumber(ctx.db, 'stockItem')).toBe('SK-00002');
    expect(await nextDocumentNumber(ctx.db, 'stockItem')).toBe('SK-00003');
  });

  it('farkli tipler birbirinin sayacini etkilemez', async () => {
    expect(await nextDocumentNumber(ctx.db, 'product')).toBe('UR-00001');
    expect(await nextDocumentNumber(ctx.db, 'supplier')).toBe('TD-00001');
    expect(await nextDocumentNumber(ctx.db, 'customer', { branchCode: 'S1' })).toBe('MS-S1-00001');
  });

  it('yilli tipte yil numaraya girer', async () => {
    const options = { branchCode: 'S1', year: 2026 };
    expect(await nextDocumentNumber(ctx.db, 'order', options)).toBe('SP-S1-2026-00001');
    expect(await nextDocumentNumber(ctx.db, 'order', options)).toBe('SP-S1-2026-00002');
  });

  it('her sube kendi dizisinde ilerler', async () => {
    // S1 zaten iki siparis uretti; S2 birinci numaradan baslamali. Aksi halde
    // bir subenin numaralarinda diger sube yuzunden bosluk olusurdu.
    expect(await nextDocumentNumber(ctx.db, 'order', { branchCode: 'S2', year: 2026 })).toBe(
      'SP-S2-2026-00001',
    );
    expect(await nextDocumentNumber(ctx.db, 'order', { branchCode: 'S1', year: 2026 })).toBe(
      'SP-S1-2026-00003',
    );
  });

  it('yil degisince sayac sifirdan baslar', async () => {
    await nextDocumentNumber(ctx.db, 'goodsReceipt', { branchCode: 'S1', year: 2026 });
    expect(
      await nextDocumentNumber(ctx.db, 'goodsReceipt', { branchCode: 'S1', year: 2027 }),
    ).toBe('MK-S1-2027-00001');
  });

  it('subeye ozel belgede sube kodu zorunludur', async () => {
    // Kod unutulursa iki sube ayni diziyi paylasir ve numaralar karisir;
    // sessizce ortak sayaca dusmektense hata vermesi dogru.
    await expect(nextDocumentNumber(ctx.db, 'order', { year: 2026 })).rejects.toThrow(
      /sube kodu gerekli/i,
    );
  });

  it('es zamanli cagrilarda ayni numara iki kez uretilmez', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        nextDocumentNumber(ctx.db, 'delivery', { branchCode: 'S1', year: 2026 }),
      ),
    );
    expect(new Set(results).size).toBe(20);
  });
});
