'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { createCustomer, updateCustomer } from '@/domain/parties/parties';
import { DomainError } from '@/lib/errors';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

function toResult(error: unknown): ActionResult {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  console.error(error);
  return { ok: false, error: 'Beklenmeyen bir hata olustu.' };
}

const customerSchema = z.object({
  name: z.string().min(1, 'Musteri adi girin.'),
  phone: z.string().optional(),
  phone2: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  district: z.string().optional(),
  taxOffice: z.string().optional(),
  taxNumber: z.string().optional(),
  notes: z.string().optional(),
});

export async function createCustomerAction(input: unknown): Promise<ActionResult> {
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const customer = await createCustomer(db, parsed.data);
    revalidatePath('/musteriler');
    return { ok: true, id: customer.id };
  } catch (error) {
    return toResult(error);
  }
}

export async function updateCustomerAction(id: string, input: unknown): Promise<ActionResult> {
  const parsed = customerSchema.partial().safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await updateCustomer(db, id, parsed.data);
    revalidatePath('/musteriler');
    revalidatePath(`/musteriler/${id}`);
    return { ok: true, id };
  } catch (error) {
    return toResult(error);
  }
}
