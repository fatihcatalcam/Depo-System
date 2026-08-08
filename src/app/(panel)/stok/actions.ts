'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { createStockItem, updateStockItem } from '@/domain/catalog/stock-items';
import { adjustStockCount } from '@/domain/stock/counting';
import { DomainError } from '@/lib/errors';
import { parseTlInput } from '@/lib/money';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function toResult(error: unknown): ActionResult {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  if (error instanceof Error && error.message.startsWith('Gecersiz tutar')) {
    return { ok: false, error: 'Fiyat bicimi hatali. Ornek: 1.250,00' };
  }
  console.error(error);
  return { ok: false, error: 'Beklenmeyen bir hata olustu.' };
}

const stockItemSchema = z.object({
  name: z.string().min(1, 'Parca adi girin.'),
  sizeLabel: z.string().optional(),
  categoryId: z.uuid().nullable().optional(),
  barcode: z.string().optional(),
  minStockLevel: z.coerce.number().int().min(0).optional(),
  purchasePrice: z.string().optional(),
  notes: z.string().optional(),
});

export async function createStockItemAction(input: unknown): Promise<ActionResult> {
  const parsed = stockItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { purchasePrice, ...rest } = parsed.data;
  try {
    const item = await createStockItem(db, {
      ...rest,
      purchasePriceKurus: purchasePrice ? parseTlInput(purchasePrice) : null,
    });
    revalidatePath('/stok');
    return { ok: true, id: item.id };
  } catch (error) {
    return toResult(error);
  }
}

export async function updateStockItemAction(id: string, input: unknown): Promise<ActionResult> {
  const parsed = stockItemSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const { purchasePrice, ...rest } = parsed.data;
  try {
    await updateStockItem(db, id, {
      ...rest,
      purchasePriceKurus: purchasePrice ? parseTlInput(purchasePrice) : undefined,
    });
    revalidatePath('/stok');
    revalidatePath(`/stok/${id}`);
    return { ok: true, id };
  } catch (error) {
    return toResult(error);
  }
}

const countSchema = z.object({
  countedQuantity: z.coerce.number().int().min(0, 'Sayilan adet negatif olamaz.'),
  notes: z.string().optional(),
});

export async function adjustStockCountAction(
  stockItemId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = countSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await adjustStockCount(db, { stockItemId, ...parsed.data });
    revalidatePath('/stok');
    revalidatePath(`/stok/${stockItemId}`);
    revalidatePath('/');
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}
