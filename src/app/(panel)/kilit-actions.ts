'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { verifyUnlockPassword } from '@/domain/auth';
import { currentScope } from '@/lib/auth/current';
import { clearStockLock, lockStock, setUnlockCookie, type LockArea } from '@/lib/auth/locks';

export interface LockResult {
  ok: boolean;
  error?: string;
}

const passwordSchema = z.string().min(1, 'Parola girin.');

/**
 * Kilidi acar. Iki alan da ayni kilit parolasini istiyor: patron stok ve
 * rapor icin tek bir parola verdi, sube giris parolasi buralari acmiyor.
 */
export async function unlockAction(area: LockArea, password: unknown): Promise<LockResult> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const scope = await currentScope();

  if (!(await verifyUnlockPassword(db, parsed.data))) {
    return {
      ok: false,
      error: `Parola hatali. ${
        area === 'raporlar' ? 'Raporlar' : 'Stok'
      } yalnizca stok ve rapor parolasiyla acilir.`,
    };
  }

  await setUnlockCookie(area, scope);
  revalidatePath(area === 'raporlar' ? '/raporlar' : '/stok');
  return { ok: true };
}

/** Stok kilidini kapatir — parola gerekmez, kilitlemek serbesttir. */
export async function lockStockAction(): Promise<LockResult> {
  await lockStock();
  revalidatePath('/stok');
  return { ok: true };
}

/** Kilidi tamamen kaldirir; yalnizca kilit acikken cagrilir. */
export async function unlockStockPermanentlyAction(password: unknown): Promise<LockResult> {
  const result = await unlockAction('stok', password);
  if (!result.ok) return result;

  await clearStockLock();
  revalidatePath('/stok');
  return { ok: true };
}
