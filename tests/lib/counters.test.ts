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
  it('yilsiz tipte sirali numara uretir', async () => {
    expect(await nextDocumentNumber(ctx.db, 'stockItem')).toBe('SK-00001');
    expect(await nextDocumentNumber(ctx.db, 'stockItem')).toBe('SK-00002');
    expect(await nextDocumentNumber(ctx.db, 'stockItem')).toBe('SK-00003');
  });

  it('farkli tipler birbirinin sayacini etkilemez', async () => {
    expect(await nextDocumentNumber(ctx.db, 'product')).toBe('UR-00001');
    expect(await nextDocumentNumber(ctx.db, 'customer')).toBe('MS-00001');
    expect(await nextDocumentNumber(ctx.db, 'supplier')).toBe('TD-00001');
  });

  it('yilli tipte yil numaraya girer', async () => {
    expect(await nextDocumentNumber(ctx.db, 'order', 2026)).toBe('SP-2026-00001');
    expect(await nextDocumentNumber(ctx.db, 'order', 2026)).toBe('SP-2026-00002');
  });

  it('yil degisince sayac sifirdan baslar', async () => {
    await nextDocumentNumber(ctx.db, 'goodsReceipt', 2026);
    expect(await nextDocumentNumber(ctx.db, 'goodsReceipt', 2027)).toBe('MK-2027-00001');
  });

  it('es zamanli cagrilarda ayni numara iki kez uretilmez', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => nextDocumentNumber(ctx.db, 'delivery', 2026)),
    );
    expect(new Set(results).size).toBe(20);
  });
});
