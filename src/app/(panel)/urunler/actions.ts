'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import {
  createProduct,
  duplicateProductForSize,
  getProductWithComponents,
  suggestSizeCounterparts,
  updateProduct,
} from '@/domain/catalog/products';
import { searchStockItems } from '@/domain/catalog/stock-items';
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
    return { ok: false, error: 'Fiyat bicimi hatali. Ornek: 15.000,00' };
  }
  console.error(error);
  return { ok: false, error: 'Beklenmeyen bir hata olustu.' };
}

const productSchema = z.object({
  name: z.string().min(1, 'Urun adi girin.'),
  categoryId: z.uuid().nullable().optional(),
  defaultPrice: z.string().optional(),
  notes: z.string().optional(),
  components: z
    .array(z.object({ stockItemId: z.uuid(), quantity: z.coerce.number().int().min(1) }))
    .min(1, 'Urun en az bir parca icermeli.'),
});

export async function createProductAction(input: unknown): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const product = await createProduct(db, {
      name: parsed.data.name,
      categoryId: parsed.data.categoryId ?? null,
      defaultPriceKurus: parsed.data.defaultPrice ? parseTlInput(parsed.data.defaultPrice) : null,
      notes: parsed.data.notes,
      components: parsed.data.components,
    });
    revalidatePath('/urunler');
    return { ok: true, id: product.id };
  } catch (error) {
    return toResult(error);
  }
}

export async function updateProductAction(id: string, input: unknown): Promise<ActionResult> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await updateProduct(db, id, {
      name: parsed.data.name,
      categoryId: parsed.data.categoryId ?? null,
      defaultPriceKurus: parsed.data.defaultPrice ? parseTlInput(parsed.data.defaultPrice) : null,
      notes: parsed.data.notes,
      components: parsed.data.components,
    });
    revalidatePath('/urunler');
    revalidatePath(`/urunler/${id}`);
    return { ok: true, id };
  } catch (error) {
    return toResult(error);
  }
}

const duplicateSchema = z.object({
  name: z.string().min(1, 'Yeni urun adi girin.'),
  targetSizeLabel: z.string().min(1, 'Hedef boyut girin.'),
  replacements: z.record(z.uuid(), z.uuid()).optional(),
});

export async function duplicateProductAction(
  sourceId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = duplicateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const product = await duplicateProductForSize(db, sourceId, parsed.data);
    revalidatePath('/urunler');
    return { ok: true, id: product.id };
  } catch (error) {
    return toResult(error);
  }
}

export interface DuplicatePreviewRow {
  sourceId: string;
  sourceLabel: string;
  selectedId: string | null;
  candidates: { id: string; label: string }[];
}

/**
 * Kopyalamadan once her parcanin hedef boyuttaki karsiligini gosterir.
 * Kullanici yanlis kumasla urun olusturmasin diye secim burada yapiliyor.
 */
export async function previewDuplicateAction(
  sourceId: string,
  targetSizeLabel: string,
): Promise<{ ok: boolean; error?: string; rows?: DuplicatePreviewRow[] }> {
  if (!targetSizeLabel.trim()) return { ok: false, error: 'Hedef boyut girin.' };

  try {
    const product = await getProductWithComponents(db, sourceId);
    const suggestions = await suggestSizeCounterparts(
      db,
      product.components.map((component) => component.stockItemId),
      targetSizeLabel.trim(),
    );

    return {
      ok: true,
      rows: product.components.map((component) => {
        const suggestion = suggestions.get(component.stockItemId);
        return {
          sourceId: component.stockItemId,
          sourceLabel:
            suggestion?.sourceLabel ??
            `${component.stockItemName} (${component.stockItemSku})`,
          selectedId: suggestion?.selectedId ?? null,
          candidates: suggestion?.candidates ?? [],
        };
      }),
    };
  } catch (error) {
    return toResult(error);
  }
}

export async function searchStockItemsAction(query: string) {
  const items = await searchStockItems(db, { query, limit: 20 });
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    sizeLabel: item.sizeLabel,
  }));
}
