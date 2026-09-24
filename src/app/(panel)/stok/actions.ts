'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { createStockItem, updateStockItem } from '@/domain/catalog/stock-items';
import { adjustStockCount } from '@/domain/stock/counting';
import { applyMovements } from '@/domain/stock/movements';
import { currentScope } from '@/lib/auth/current';
import { isStockLocked } from '@/lib/auth/locks';
import { DomainError } from '@/lib/errors';
import { parseTlInput } from '@/lib/money';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

export interface QuickAdjustResult extends ActionResult {
  /** Islemden sonraki kesin bakiye — istemci ekrani buna gore duzeltir. */
  onHand?: number;
}

/**
 * Kilit kontrolu her yazma eyleminde tekrarlaniyor.
 *
 * Arayuzde dugmeleri kapatmak yeterli degil: sunucu eylemleri dogrudan
 * cagrilabilir. Kilidin anlami olmasi icin kararin sunucuda verilmesi sart.
 */
async function assertStockUnlocked(): Promise<ActionResult | null> {
  if (await isStockLocked(await currentScope())) {
    return { ok: false, error: 'Stok kilitli. Once kilidi acin.' };
  }
  return null;
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
  variantLabel: z.string().optional(),
  categoryId: z.uuid().nullable().optional(),
  barcode: z.string().optional(),
  minStockLevel: z.coerce.number().int().min(0).optional(),
  purchasePrice: z.string().optional(),
  notes: z.string().optional(),
});

export async function createStockItemAction(input: unknown): Promise<ActionResult> {
  const locked = await assertStockUnlocked();
  if (locked) return locked;

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
  const locked = await assertStockUnlocked();
  if (locked) return locked;

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

/**
 * Listeden hizli stok duzeltme. Hizli olmasi gerekiyor ama sessiz olmamali:
 * hareket defterine "elle duzeltme" olarak isleniyor, boylece stogun neden
 * degistigi sonradan okunabiliyor.
 *
 * Istemci ard arda basilan dokunuslari biriktirip tek cagriya cevirir; bu
 * yuzden delta 1'den buyuk gelebilir. Defterde de tek satir olusur — depocunun
 * "5 tane geldi" dusuncesine bes ayri +1 satirindan daha yakin.
 */
export async function quickAdjustStockAction(
  stockItemId: string,
  delta: number,
): Promise<QuickAdjustResult> {
  const locked = await assertStockUnlocked();
  if (locked) return locked;

  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) {
    return { ok: false, error: 'Gecersiz miktar.' };
  }

  try {
    const scope = await currentScope();
    const [result] = await applyMovements(db, scope.stockBranchId, [
      {
        stockItemId,
        quantityChange: delta,
        movementType: 'manual',
        notes: 'Stok listesinden hizli duzeltme',
      },
    ]);
    revalidatePath('/stok');
    revalidatePath(`/stok/${stockItemId}`);
    revalidatePath('/');
    return { ok: true, onHand: result.balanceAfter };
  } catch (error) {
    return toResult(error);
  }
}

const noteSchema = z
  .string()
  .max(200, 'Not en fazla 200 karakter olabilir.')
  .transform((value) => value.trim());

/**
 * Stok listesinden satir ici not. Notlar anlik ve siktir ("2. subeye odunc
 * verildi", "bu partinin rengi koyu"); kart acmayi gerektirmemeli.
 *
 * Hareket defterine yazilmiyor: not bir stok hareketi degil, kartin uzerindeki
 * bir aciklama. Adet degismiyor.
 */
export async function updateStockNoteAction(
  stockItemId: string,
  note: unknown,
): Promise<ActionResult> {
  const locked = await assertStockUnlocked();
  if (locked) return locked;

  const parsed = noteSchema.safeParse(note);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await updateStockItem(db, stockItemId, { notes: parsed.data || null });
    revalidatePath('/stok');
    revalidatePath(`/stok/${stockItemId}`);
    return { ok: true, id: stockItemId };
  } catch (error) {
    return toResult(error);
  }
}

export async function adjustStockCountAction(
  stockItemId: string,
  input: unknown,
): Promise<ActionResult> {
  const locked = await assertStockUnlocked();
  if (locked) return locked;

  const parsed = countSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await adjustStockCount(db, (await currentScope()).stockBranchId, {
      stockItemId,
      ...parsed.data,
    });
    revalidatePath('/stok');
    revalidatePath(`/stok/${stockItemId}`);
    revalidatePath('/');
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}
