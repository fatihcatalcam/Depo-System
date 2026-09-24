import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { appSettings, branches } from '@/db/schema';
import {
  authenticate,
  changeOwnPassword,
  login,
  setUnlockPassword,
  verifyUnlockPassword,
} from '@/domain/auth';
import {
  listBranches,
  listLoginableBranches,
  renameBranch,
  setBranchPassword,
} from '@/domain/branches';
import { ensureSettings } from '@/domain/settings';
import { createTestDb, type TestDb } from '../helpers/test-db';

async function branchIdOf(ctx: TestDb, code: string): Promise<string> {
  const [row] = await ctx.db.select().from(branches).where(eq(branches.code, code));
  return row.id;
}

/** Iki subenin de parolasi belirlenmis, kullanima hazir bir kurulum. */
async function setupAccounts() {
  const ctx = await createTestDb();
  await ensureSettings(ctx.db, 'kilitparola');

  const s1 = await branchIdOf(ctx, 'S1');
  const s2 = await branchIdOf(ctx, 'S2');
  await setBranchPassword(ctx.db, s1, 'sube1parola');
  await setBranchPassword(ctx.db, s2, 'sube2parola');

  return { ctx, s1, s2 };
}

let shared: Awaited<ReturnType<typeof setupAccounts>>;

beforeAll(async () => {
  shared = await setupAccounts();
});

afterAll(async () => {
  await shared.ctx.close();
});

describe('sube hesaplari', () => {
  it('her sube kendi parolasiyla girer', async () => {
    const { ctx, s1, s2 } = shared;
    expect(await authenticate(ctx.db, s1, 'sube1parola')).toMatchObject({ ok: true });
    expect(await authenticate(ctx.db, s2, 'sube2parola')).toMatchObject({ ok: true });
  });

  it('bir subenin parolasi digerinde calismaz', async () => {
    const { ctx, s1, s2 } = shared;
    expect(await authenticate(ctx.db, s1, 'sube2parola')).toEqual({ ok: false });
    expect(await authenticate(ctx.db, s2, 'sube1parola')).toEqual({ ok: false });
  });

  it('kilit parolasi subede calismaz', async () => {
    const { ctx, s1 } = shared;
    expect(await authenticate(ctx.db, s1, 'kilitparola')).toEqual({ ok: false });
  });

  it('giris kapsami subeyi ve merkez bayragini tasir', async () => {
    const { ctx, s1, s2 } = shared;

    expect(await authenticate(ctx.db, s1, 'sube1parola')).toEqual({
      ok: true,
      scope: { branchId: s1, branchCode: 'S1', isCentral: true, stockBranchId: s1 },
    });
    // Sube 2 merkezin deposundan satiyor: kendi kimligi degil, merkezinki.
    expect(await authenticate(ctx.db, s2, 'sube2parola')).toEqual({
      ok: true,
      scope: { branchId: s2, branchCode: 'S2', isCentral: false, stockBranchId: s1 },
    });
  });
});

/**
 * Giris ekraninda sube secimi yok: parola hangi subeninse o sube acilir.
 */
describe('giris ekrani', () => {
  it('sube parolasi o subeyi acar', async () => {
    const { ctx } = shared;
    expect(await login(ctx.db, 'sube1parola')).toMatchObject({
      ok: true,
      scope: { branchCode: 'S1', isCentral: true },
    });
    expect(await login(ctx.db, 'sube2parola')).toMatchObject({
      ok: true,
      scope: { branchCode: 'S2', isCentral: false },
    });
  });

  /**
   * Bu testin varlik sebebi: yonetici hesabi varken bu parola hem kilidi
   * aciyor hem giris yapiyordu, yani kilidi acsin diye verilen parola iki
   * subenin verisini birden aciyordu. Hesap kaldirildi, kapinin kapali
   * kaldigini burasi bekliyor.
   */
  it('stok ve rapor parolasi giris ekraninda hicbir hesap acmaz', async () => {
    const { ctx } = shared;
    expect(await login(ctx.db, 'kilitparola')).toEqual({ ok: false });
  });

  it('tanimsiz parola reddedilir', async () => {
    const { ctx } = shared;
    expect(await login(ctx.db, 'boyle-bir-parola-yok')).toEqual({ ok: false });
  });

  it('hicbir subenin parolasi yoksa girilemez', async () => {
    const ctx = await createTestDb();
    await ensureSettings(ctx.db, 'kilitparola');

    expect(await login(ctx.db, 'kilitparola')).toEqual({ ok: false });
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
    expect(await login(ctx.db, 'sube2parola')).toMatchObject({
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
   * Parola artik subenin tek isareti. Iki sube ayni parolayi kullanirsa
   * birine bir daha girilemez; bastan reddediliyor.
   */
  it('sube parolasi kilit parolasiyla ayni olamaz', async () => {
    const { ctx, s1 } = await setupAccounts();

    await expect(setBranchPassword(ctx.db, s1, 'kilitparola')).rejects.toThrow(
      'stok ve rapor kilidini aciyor',
    );

    await ctx.close();
  });

  it('sube parolasi diger subeninkiyle ayni olamaz', async () => {
    const { ctx, s1 } = await setupAccounts();

    await expect(setBranchPassword(ctx.db, s1, 'sube2parola')).rejects.toThrow(
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
   * Kilitlenme sayaci sube basina: bir subede parola yanlis girildi diye
   * digeri kapanirsa is durur.
   */
  it('bir subenin kilitlenmesi digerini etkilemez', async () => {
    const { ctx, s1, s2 } = await setupAccounts();

    for (let i = 0; i < 5; i += 1) await authenticate(ctx.db, s1, 'yanlis');

    expect(await authenticate(ctx.db, s2, 'sube2parola')).toMatchObject({ ok: true });

    await ctx.close();
  });

  it('basarili giris hatali deneme sayacini sifirlar', async () => {
    const { ctx, s1 } = await setupAccounts();

    await authenticate(ctx.db, s1, 'yanlis');
    await authenticate(ctx.db, s1, 'yanlis');
    await authenticate(ctx.db, s1, 'sube1parola');

    const [row] = await ctx.db.select().from(branches).where(eq(branches.id, s1));
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
    const { ctx, s1 } = await setupAccounts();
    await expect(changeOwnPassword(ctx.db, s1, 'sube1parola', '123')).rejects.toThrow(
      'Parola en az 6 karakter olmali',
    );
    await ctx.close();
  });

  it('sube kendi parolasini kilit parolasiyla ayni yapamaz', async () => {
    const { ctx, s1 } = await setupAccounts();
    await expect(changeOwnPassword(ctx.db, s1, 'sube1parola', 'kilitparola')).rejects.toThrow(
      'stok ve rapor kilidini aciyor',
    );
    await ctx.close();
  });

  /**
   * Merkez mevcut parolayi bilmeden sube parolasi belirleyebilir: sube
   * calisani parolasini unuttugunda patron yenisini verebilmeli.
   */
  it('merkez sube parolasini mevcut parolayi bilmeden degistirir', async () => {
    const { ctx, s1 } = await setupAccounts();
    await setBranchPassword(ctx.db, s1, 'patronunverdigi');
    expect(await authenticate(ctx.db, s1, 'patronunverdigi')).toMatchObject({ ok: true });
    expect(await authenticate(ctx.db, s1, 'sube1parola')).toEqual({ ok: false });
    await ctx.close();
  });
});

describe('sube yonetimi', () => {
  it('goc iki subeyi parolasiz olusturur ve S1 merkez olur', async () => {
    const ctx = await createTestDb();
    const list = await listBranches(ctx.db);

    expect(list.map((row) => row.code)).toEqual(['S1', 'S2']);
    expect(list.every((row) => row.hasPassword === false)).toBe(true);
    expect(list.map((row) => row.isCentral)).toEqual([true, false]);
    expect(list.find((row) => row.code === 'S1')?.name).toBe('Merkez');

    // Parolasi olmayan sube giris ekraninda listelenmez.
    expect(await listLoginableBranches(ctx.db)).toEqual([]);

    await ctx.close();
  });

  it('merkez birden fazla olamaz', async () => {
    const { ctx, s2 } = await setupAccounts();

    await expect(
      ctx.db.update(branches).set({ isCentral: true }).where(eq(branches.id, s2)),
    ).rejects.toThrow();

    await ctx.close();
  });

  it('sube adi degistirilebilir', async () => {
    const { ctx, s1 } = await setupAccounts();

    await renameBranch(ctx.db, s1, 'Merkez Magaza');

    const list = await listBranches(ctx.db);
    expect(list.find((row) => row.id === s1)?.name).toBe('Merkez Magaza');

    // Ad jetonda tasinmadigi icin mevcut oturum gecerli kalmali.
    expect(await authenticate(ctx.db, s1, 'sube1parola')).toMatchObject({ ok: true });

    await ctx.close();
  });

  it('bos sube adi reddedilir', async () => {
    const { ctx, s1 } = await setupAccounts();
    await expect(renameBranch(ctx.db, s1, '   ')).rejects.toThrow('Sube adi bos olamaz');
    await ctx.close();
  });

  it('kapali subeye giris yapilamaz', async () => {
    const { ctx, s1 } = await setupAccounts();
    await ctx.db.update(branches).set({ isActive: false }).where(eq(branches.id, s1));

    await expect(authenticate(ctx.db, s1, 'sube1parola')).rejects.toThrow('Bu sube kapali');
    await ctx.close();
  });
});

/**
 * Stok ve rapor kilidi. Hangi parolanin gectigi kimin ne gorebilecegini
 * belirliyor, bu yuzden ayrica test ediliyor.
 */
describe('kilit parolasi', () => {
  it('yalnizca kilit parolasi gecer', async () => {
    const { ctx } = await setupAccounts();

    expect(await verifyUnlockPassword(ctx.db, 'kilitparola')).toBe(true);
    // Sube kendi parolasiyla acabilseydi kilidin anlami kalmazdi.
    expect(await verifyUnlockPassword(ctx.db, 'sube1parola')).toBe(false);
    expect(await verifyUnlockPassword(ctx.db, 'sube2parola')).toBe(false);
    expect(await verifyUnlockPassword(ctx.db, 'yanlis')).toBe(false);

    await ctx.close();
  });

  it('kilit parolasi degistirilebilir', async () => {
    const { ctx } = await setupAccounts();

    await setUnlockPassword(ctx.db, 'yenikilit');

    expect(await verifyUnlockPassword(ctx.db, 'yenikilit')).toBe(true);
    expect(await verifyUnlockPassword(ctx.db, 'kilitparola')).toBe(false);
    // Yeni kilit parolasi giris ekraninda da hicbir sey acmamali.
    expect(await login(ctx.db, 'yenikilit')).toEqual({ ok: false });

    await ctx.close();
  });

  it('kilit parolasi bir subenin giris parolasi olamaz', async () => {
    const { ctx } = await setupAccounts();

    await expect(setUnlockPassword(ctx.db, 'sube2parola')).rejects.toThrow(
      'giris parolasi',
    );

    await ctx.close();
  });

  it('kisa kilit parolasi reddedilir', async () => {
    const { ctx } = await setupAccounts();
    await expect(setUnlockPassword(ctx.db, '123')).rejects.toThrow(
      'Parola en az 6 karakter olmali',
    );
    await ctx.close();
  });
});
