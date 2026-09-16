import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appSettings, branches } from '@/db/schema';
import {
  authenticate,
  changeOwnPassword,
  login,
  verifyUnlockPassword,
  type Account,
} from '@/domain/auth';
import { listBranches, listLoginableBranches, renameBranch, setBranchPassword } from '@/domain/branches';
import { branchScope, adminScope } from '@/domain/scope';
import { ensureSettings } from '@/domain/settings';
import { createTestDb, type TestDb } from '../helpers/test-db';

const ADMIN: Account = { kind: 'admin' };

async function branchAccount(ctx: TestDb, code: string): Promise<Account> {
  const [row] = await ctx.db.select().from(branches).where(eq(branches.code, code));
  return { kind: 'branch', branchId: row.id };
}

/** Uc hesabin da parolasi belirlenmis, kullanima hazir bir kurulum. */
async function setupAccounts() {
  const ctx = await createTestDb();
  await ensureSettings(ctx.db, 'yoneticiparola');

  const s1 = await branchAccount(ctx, 'S1');
  const s2 = await branchAccount(ctx, 'S2');
  await setBranchPassword(ctx.db, (s1 as { branchId: string }).branchId, 'sube1parola');
  await setBranchPassword(ctx.db, (s2 as { branchId: string }).branchId, 'sube2parola');

  return { ctx, s1, s2 };
}

let shared: Awaited<ReturnType<typeof setupAccounts>>;

beforeAll(async () => {
  shared = await setupAccounts();
});

afterAll(async () => {
  await shared.ctx.close();
});

describe('uc hesap', () => {
  it('her hesap kendi parolasiyla girer', async () => {
    const { ctx, s1, s2 } = shared;
    expect(await authenticate(ctx.db, ADMIN, 'yoneticiparola')).toMatchObject({ ok: true });
    expect(await authenticate(ctx.db, s1, 'sube1parola')).toMatchObject({ ok: true });
    expect(await authenticate(ctx.db, s2, 'sube2parola')).toMatchObject({ ok: true });
  });

  it('bir subenin parolasi digerinde calismaz', async () => {
    const { ctx, s1, s2 } = shared;
    expect(await authenticate(ctx.db, s1, 'sube2parola')).toEqual({ ok: false });
    expect(await authenticate(ctx.db, s2, 'sube1parola')).toEqual({ ok: false });
  });

  it('yonetici parolasi subede calismaz', async () => {
    const { ctx, s1 } = shared;
    expect(await authenticate(ctx.db, s1, 'yoneticiparola')).toEqual({ ok: false });
  });

  it('giris kapsami dogru hesabi gosterir', async () => {
    const { ctx, s1 } = shared;

    const adminResult = await authenticate(ctx.db, ADMIN, 'yoneticiparola');
    expect(adminResult).toEqual({ ok: true, scope: { kind: 'admin' } });

    const branchResult = await authenticate(ctx.db, s1, 'sube1parola');
    expect(branchResult).toEqual({
      ok: true,
      scope: { kind: 'branch', branchId: (s1 as { branchId: string }).branchId, branchCode: 'S1' },
    });
  });
});

/**
 * Giris ekraninda sube secimi yok: parola hangi hesabinsa o hesap acilir.
 */
describe('giris ekrani', () => {
  it('sube parolasi o subeyi acar', async () => {
    const { ctx } = shared;
    expect(await login(ctx.db, 'sube1parola')).toMatchObject({
      ok: true,
      scope: { kind: 'branch', branchCode: 'S1' },
    });
    expect(await login(ctx.db, 'sube2parola')).toMatchObject({
      ok: true,
      scope: { kind: 'branch', branchCode: 'S2' },
    });
  });

  it('yonetici parolasi yonetici hesabini acar', async () => {
    const { ctx } = shared;
    expect(await login(ctx.db, 'yoneticiparola')).toEqual({ ok: true, scope: { kind: 'admin' } });
  });

  it('tanimsiz parola reddedilir', async () => {
    const { ctx } = shared;
    expect(await login(ctx.db, 'boyle-bir-parola-yok')).toEqual({ ok: false });
  });

  it('hicbir sube yapilandirilmamissa parola yoneticiyi acar', async () => {
    const ctx = await createTestDb();
    await ensureSettings(ctx.db, 'yoneticiparola');

    expect(await login(ctx.db, 'yoneticiparola')).toEqual({ ok: true, scope: { kind: 'admin' } });
    expect(await login(ctx.db, 'yanlis')).toEqual({ ok: false });

    await ctx.close();
  });

  /**
   * Sayac tek oldugu icin kilit girisin tamamini kapatiyor. Bu bilincli bir
   * odun: parolayi kimin yazdigini bilmeden hesap basina sayac tutulamaz.
   */
  it('bes yanlis denemeden sonra giris gecici olarak kapanir', async () => {
    const { ctx } = await setupAccounts();

    for (let i = 0; i < 5; i += 1) await login(ctx.db, 'yanlis');

    expect(await login(ctx.db, 'sube1parola')).toMatchObject({
      ok: false,
      lockedMinutes: expect.any(Number),
    });
    expect(await login(ctx.db, 'yoneticiparola')).toMatchObject({
      ok: false,
      lockedMinutes: expect.any(Number),
    });

    await ctx.close();
  });

  it('basarili giris sayaci sifirlar', async () => {
    const { ctx } = await setupAccounts();

    await login(ctx.db, 'yanlis');
    await login(ctx.db, 'yanlis');
    await login(ctx.db, 'sube1parola');

    const [row] = await ctx.db.select().from(appSettings).where(eq(appSettings.id, 1));
    expect(row.failedAttempts).toBe(0);

    await ctx.close();
  });

  /**
   * Parola artik hesabin tek isareti. Iki hesap ayni parolayi kullanirsa
   * birine bir daha girilemez; ikisi de bastan reddediliyor.
   */
  it('sube parolasi yonetici parolasiyla ayni olamaz', async () => {
    const { ctx, s1 } = await setupAccounts();
    const id = s1.kind === 'branch' ? s1.branchId : '';

    await expect(setBranchPassword(ctx.db, id, 'yoneticiparola')).rejects.toThrow(
      'yonetici parolasiyla ayni olamaz',
    );

    await ctx.close();
  });

  it('sube parolasi diger subeninkiyle ayni olamaz', async () => {
    const { ctx, s1 } = await setupAccounts();
    const id = s1.kind === 'branch' ? s1.branchId : '';

    await expect(setBranchPassword(ctx.db, id, 'sube2parola')).rejects.toThrow(
      'subesinde kullaniliyor',
    );

    await ctx.close();
  });
});

describe('kilitlenme', () => {
  it('bes yanlis denemeden sonra hesap gecici kilitlenir', async () => {
    const { ctx, s1 } = await setupAccounts();

    for (let i = 0; i < 5; i += 1) await authenticate(ctx.db, s1, 'yanlis');

    // Kilitliyken dogru parola bile kabul edilmez.
    expect(await authenticate(ctx.db, s1, 'sube1parola')).toMatchObject({
      ok: false,
      lockedMinutes: expect.any(Number),
    });

    await ctx.close();
  });

  /**
   * Kilitlenme sayaci hesap basina: bir subede parola yanlis girildi diye
   * digeri ya da yonetici kapanirsa is durur.
   */
  it('bir hesabin kilitlenmesi digerlerini etkilemez', async () => {
    const { ctx, s1, s2 } = await setupAccounts();

    for (let i = 0; i < 5; i += 1) await authenticate(ctx.db, s1, 'yanlis');

    expect(await authenticate(ctx.db, s2, 'sube2parola')).toMatchObject({ ok: true });
    expect(await authenticate(ctx.db, ADMIN, 'yoneticiparola')).toMatchObject({ ok: true });

    await ctx.close();
  });

  it('basarili giris hatali deneme sayacini sifirlar', async () => {
    const { ctx, s1 } = await setupAccounts();

    await authenticate(ctx.db, s1, 'yanlis');
    await authenticate(ctx.db, s1, 'yanlis');
    await authenticate(ctx.db, s1, 'sube1parola');

    const [row] = await ctx.db
      .select()
      .from(branches)
      .where(eq(branches.id, (s1 as { branchId: string }).branchId));
    expect(row.failedAttempts).toBe(0);

    await ctx.close();
  });
});

describe('parola degistirme', () => {
  it('eski parola dogruysa degistirir', async () => {
    const { ctx, s1 } = await setupAccounts();
    await changeOwnPassword(ctx.db, s1, 'sube1parola', 'yenisifre');
    expect(await authenticate(ctx.db, s1, 'yenisifre')).toMatchObject({ ok: true });
    await ctx.close();
  });

  it('eski parola yanlissa reddeder', async () => {
    const { ctx, s1 } = await setupAccounts();
    await expect(changeOwnPassword(ctx.db, s1, 'hatali', 'yenisifre')).rejects.toThrow(
      'Mevcut parola hatali',
    );
    await ctx.close();
  });

  it('kisa parola reddedilir', async () => {
    const { ctx } = await setupAccounts();
    await expect(changeOwnPassword(ctx.db, ADMIN, 'yoneticiparola', '123')).rejects.toThrow(
      'Parola en az 6 karakter olmali',
    );
    await ctx.close();
  });

  /**
   * Yonetici mevcut parolayi bilmeden sube parolasi belirleyebilir: sube
   * calisani parolasini unuttugunda patron yenisini verebilmeli.
   */
  it('yonetici sube parolasini mevcut parolayi bilmeden degistirir', async () => {
    const { ctx, s1 } = await setupAccounts();
    await setBranchPassword(ctx.db, (s1 as { branchId: string }).branchId, 'patronunverdigi');
    expect(await authenticate(ctx.db, s1, 'patronunverdigi')).toMatchObject({ ok: true });
    expect(await authenticate(ctx.db, s1, 'sube1parola')).toEqual({ ok: false });
    await ctx.close();
  });
});

describe('sube yonetimi', () => {
  it('goc iki subeyi parolasiz olusturur', async () => {
    const ctx = await createTestDb();
    const list = await listBranches(ctx.db);

    expect(list.map((row) => row.code)).toEqual(['S1', 'S2']);
    expect(list.every((row) => row.hasPassword === false)).toBe(true);

    // Parolasi olmayan sube giris ekraninda listelenmez.
    expect(await listLoginableBranches(ctx.db)).toEqual([]);

    await ctx.close();
  });

  it('parola belirlenince sube giris ekraninda gorunur', async () => {
    const { ctx } = await setupAccounts();
    const loginable = await listLoginableBranches(ctx.db);
    expect(loginable.map((row) => row.code)).toEqual(['S1', 'S2']);
    await ctx.close();
  });

  it('sube adi degistirilebilir', async () => {
    const { ctx, s1 } = await setupAccounts();
    const branchId = (s1 as { branchId: string }).branchId;

    await renameBranch(ctx.db, branchId, 'Merkez Magaza');

    const list = await listBranches(ctx.db);
    expect(list.find((row) => row.id === branchId)?.name).toBe('Merkez Magaza');

    // Ad jetonda tasinmadigi icin mevcut oturum gecerli kalmali.
    expect(await authenticate(ctx.db, s1, 'sube1parola')).toMatchObject({ ok: true });

    await ctx.close();
  });

  it('bos sube adi reddedilir', async () => {
    const { ctx, s1 } = await setupAccounts();
    await expect(
      renameBranch(ctx.db, (s1 as { branchId: string }).branchId, '   '),
    ).rejects.toThrow('Sube adi bos olamaz');
    await ctx.close();
  });

  it('kapali subeye giris yapilamaz', async () => {
    const { ctx, s1 } = await setupAccounts();
    await ctx.db
      .update(branches)
      .set({ isActive: false })
      .where(eq(branches.id, (s1 as { branchId: string }).branchId));

    await expect(authenticate(ctx.db, s1, 'sube1parola')).rejects.toThrow('Bu sube kapali');
    await ctx.close();
  });
});

/**
 * Ekran kilitleri. Hangi parolanin gectigi kimin calisabilecegini belirliyor,
 * bu yuzden ayrica test ediliyor.
 */
describe('kilit parolalari', () => {
  it('raporlar yalnizca yonetici parolasiyla acilir', async () => {
    const { ctx, s1 } = await setupAccounts();
    const scope = branchScope((s1 as { branchId: string }).branchId, 'S1');

    expect(await verifyUnlockPassword(ctx.db, scope, 'yoneticiparola', 'admin')).toBe(true);
    // Sube kendi parolasiyla acabilseydi kilidin anlami kalmazdi.
    expect(await verifyUnlockPassword(ctx.db, scope, 'sube1parola', 'admin')).toBe(false);
    expect(await verifyUnlockPassword(ctx.db, scope, 'yanlis', 'admin')).toBe(false);

    await ctx.close();
  });

  it('stok kilidi kendi sube parolasiyla da acilir', async () => {
    const { ctx, s1 } = await setupAccounts();
    const scope = branchScope((s1 as { branchId: string }).branchId, 'S1');

    expect(await verifyUnlockPassword(ctx.db, scope, 'sube1parola', 'own')).toBe(true);
    expect(await verifyUnlockPassword(ctx.db, scope, 'yoneticiparola', 'own')).toBe(true);
    // Diger subenin parolasi gecmez.
    expect(await verifyUnlockPassword(ctx.db, scope, 'sube2parola', 'own')).toBe(false);

    await ctx.close();
  });

  it('yonetici oturumunda stok kilidi yonetici parolasiyla acilir', async () => {
    const { ctx } = await setupAccounts();
    expect(await verifyUnlockPassword(ctx.db, adminScope, 'yoneticiparola', 'own')).toBe(true);
    expect(await verifyUnlockPassword(ctx.db, adminScope, 'sube1parola', 'own')).toBe(false);
    await ctx.close();
  });
});
