'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { createCategory, deleteCategory, updateCategory } from '@/domain/catalog/categories';
import { DomainError } from '@/lib/errors';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function toResult(error: unknown): ActionResult {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: 'Beklenmeyen bir hata olustu.' };
}

const createSchema = z.object({
  name: z.string().min(1, 'Kategori adi girin.'),
  parentId: z.uuid().nullable(),
});

export async function createCategoryAction(input: {
  name: string;
  parentId: string | null;
}): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await createCategory(db, parsed.data);
    revalidatePath('/kategoriler');
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function renameCategoryAction(id: string, name: string): Promise<ActionResult> {
  try {
    await updateCategory(db, id, { name });
    revalidatePath('/kategoriler');
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  try {
    await deleteCategory(db, id);
    revalidatePath('/kategoriler');
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}
