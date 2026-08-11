'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { changeOwnPassword, type Account } from '@/domain/auth';
import { renameBranch, setBranchPassword } from '@/domain/branches';
import { importCustomers, importStockItems, type ImportResult } from '@/domain/excel';
import { updateCompanyInfo } from '@/domain/settings';
import { recalculateStockBalances } from '@/domain/stock/maintenance';
import { currentScope, currentUser } from '@/lib/auth/current';
import { DomainError } from '@/lib/errors';

export interface ActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

function toResult(error: unknown): ActionResult {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: 'Beklenmeyen bir hata olustu.' };
}

const companySchema = z.object({
  companyName: z.string().min(1, 'Firma adi girin.'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  taxInfo: z.string().optional(),
});

export async function updateCompanyAction(input: unknown): Promise<ActionResult> {
  const parsed = companySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await updateCompanyInfo(db, parsed.data);
    revalidatePath('/ayarlar');
    return { ok: true, message: 'Firma bilgileri kaydedildi.' };
  } catch (error) {
    return toResult(error);
  }
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mevcut parolayi girin.'),
    newPassword: z.string().min(6, 'Yeni parola en az 6 karakter olmali.'),
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'Yeni parolalar birbiriyle ayni degil.',
    path: ['confirmPassword'],
  });

/** Oturumu acik olan hesabin kendi parolasi — mevcut parola sorulur. */
export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const scope = await currentScope();
    const account: Account =
      scope.kind === 'admin' ? { kind: 'admin' } : { kind: 'branch', branchId: scope.branchId };

    await changeOwnPassword(db, account, parsed.data.currentPassword, parsed.data.newPassword);
    return { ok: true, message: 'Parola degistirildi.' };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * Sube yonetimi — yalnizca yonetici.
 *
 * Sube parolasi belirlenirken mevcut parola sorulmuyor: sube calisani
 * parolasini unuttugunda patron yenisini verebilmeli. Yetki kontrolu
 * oturumdan yapiliyor, formdan gelen bir bayraktan degil.
 */
async function assertAdmin(): Promise<void> {
  const user = await currentUser();
  if (!user.isAdmin) {
    throw new DomainError('Bu islem yalnizca yonetici hesabiyla yapilabilir.', 'FORBIDDEN');
  }
}

const branchNameSchema = z.object({
  branchId: z.uuid(),
  name: z.string().min(1, 'Sube adi girin.'),
});

export async function renameBranchAction(input: unknown): Promise<ActionResult> {
  const parsed = branchNameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await assertAdmin();
    await renameBranch(db, parsed.data.branchId, parsed.data.name);
    revalidatePath('/ayarlar');
    revalidatePath('/', 'layout');
    return { ok: true, message: 'Sube adi guncellendi.' };
  } catch (error) {
    return toResult(error);
  }
}

const branchPasswordSchema = z.object({
  branchId: z.uuid(),
  newPassword: z.string().min(6, 'Parola en az 6 karakter olmali.'),
});

export async function setBranchPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = branchPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await assertAdmin();
    await setBranchPassword(db, parsed.data.branchId, parsed.data.newPassword);
    revalidatePath('/ayarlar');
    return { ok: true, message: 'Sube parolasi belirlendi.' };
  } catch (error) {
    return toResult(error);
  }
}

export async function recalculateStockAction(): Promise<ActionResult> {
  try {
    const { fixed, changes } = await recalculateStockBalances(db);
    revalidatePath('/stok');
    revalidatePath('/');

    if (fixed === 0) {
      return { ok: true, message: 'Tum stok bakiyeleri hareket defteriyle uyumlu.' };
    }

    // Ne degistigini acikca soyluyoruz: bakim islemi sessizce stok
    // degistirirse kimse fark etmez.
    const detail = changes
      .slice(0, 5)
      .map((change) => `${change.name}: ${change.from} → ${change.to}`)
      .join(', ');

    return {
      ok: true,
      message: `${fixed} kartin bakiyesi duzeltildi. ${detail}${changes.length > 5 ? ' ...' : ''}`,
    };
  } catch (error) {
    return toResult(error);
  }
}

export interface ImportActionResult extends ActionResult {
  result?: ImportResult;
}

export async function importExcelAction(
  kind: 'musteri' | 'stok',
  formData: FormData,
): Promise<ImportActionResult> {
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Bir Excel dosyasi secin.' };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: 'Dosya 5 MB sinirini asiyor.' };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result =
      kind === 'musteri'
        ? await importCustomers(db, await currentScope(), buffer)
        : await importStockItems(db, buffer);

    revalidatePath('/stok');
    revalidatePath('/musteriler');

    return {
      ok: true,
      message: `${result.imported} kayit aktarildi${result.skipped > 0 ? `, ${result.skipped} satir atlandi (bos veya zaten mevcut)` : ''}.`,
      result,
    };
  } catch (error) {
    return toResult(error);
  }
}
