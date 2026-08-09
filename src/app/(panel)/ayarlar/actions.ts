'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { importCustomers, importStockItems, type ImportResult } from '@/domain/excel';
import { changePassword, updateCompanyInfo } from '@/domain/settings';
import { recalculateStockBalances } from '@/domain/stock/maintenance';
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

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await changePassword(db, parsed.data.currentPassword, parsed.data.newPassword);
    return { ok: true, message: 'Parola degistirildi.' };
  } catch (error) {
    return toResult(error);
  }
}

export async function recalculateStockAction(): Promise<ActionResult> {
  try {
    const fixed = await recalculateStockBalances(db);
    revalidatePath('/stok');
    revalidatePath('/');
    return {
      ok: true,
      message:
        fixed === 0
          ? 'Tum stok bakiyeleri hareket defteriyle uyumlu.'
          : `${fixed} stok kartinin bakiyesi duzeltildi.`,
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
        ? await importCustomers(db, buffer)
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
