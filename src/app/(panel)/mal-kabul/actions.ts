'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { searchStockItems } from '@/domain/catalog/stock-items';
import { createGoodsReceipt } from '@/domain/goods-receipt';
import { createSupplier } from '@/domain/parties/parties';
import {
  readReceiptDocument,
  RECEIPT_MIME_TYPES,
  type ReadResult,
  type ReceiptMimeType,
} from '@/domain/receipt-reader';
import { currentScope } from '@/lib/auth/current';
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

const receiptSchema = z.object({
  supplierId: z.uuid().nullable().optional(),
  waybillNo: z.string().optional(),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih gecersiz.'),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        stockItemId: z.uuid(),
        quantity: z.coerce.number().int().min(1),
        unitCost: z.string().optional(),
      }),
    )
    .min(1, 'En az bir satir ekleyin.'),
});

export async function createGoodsReceiptAction(input: unknown): Promise<ActionResult> {
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const receipt = await createGoodsReceipt(db, await currentScope(), {
      supplierId: parsed.data.supplierId ?? null,
      waybillNo: parsed.data.waybillNo,
      receivedAt: parsed.data.receivedAt,
      notes: parsed.data.notes,
      lines: parsed.data.lines.map((line) => ({
        stockItemId: line.stockItemId,
        quantity: line.quantity,
        unitCostKurus: line.unitCost ? parseTlInput(line.unitCost) : null,
      })),
    });

    revalidatePath('/mal-kabul');
    revalidatePath('/stok');
    revalidatePath('/');
    return { ok: true, id: receipt.id };
  } catch (error) {
    return toResult(error);
  }
}

export async function createSupplierQuickAction(name: string): Promise<ActionResult> {
  try {
    const supplier = await createSupplier(db, { name });
    revalidatePath('/mal-kabul');
    revalidatePath('/tedarikciler');
    return { ok: true, id: supplier.id };
  } catch (error) {
    return toResult(error);
  }
}

/** Barkod veya isimle parca arar. Barkod okutuldugunda tam eslesme beklenir. */
export async function findStockItemsAction(query: string) {
  const items = await searchStockItems(db, { query, limit: 20 });
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    sku: item.sku,
    sizeLabel: item.sizeLabel,
    barcode: item.barcode,
  }));
}

/**
 * Vercel bir istegin govdesini 4,5 MB'ta kesiyor; sunucu eylemi siniri da
 * `next.config.ts` icinde 4 MB. Fotograflar tarayicida kucultulup geliyor,
 * bu sinira yalnizca buyuk PDF'ler takilir.
 */
const MAX_DOCUMENT_BYTES = 3.8 * 1024 * 1024;

/**
 * Irsaliyeyi okuyup form icin satir onerir. Stoga yazmaz: kayit yine
 * kullanicinin "Kaydet" dugmesiyle, `createGoodsReceiptAction` uzerinden.
 */
export async function readReceiptDocumentAction(formData: FormData): Promise<ReadResult> {
  // Oturum kontrolu: disaridan cagrilip yapay zeka faturasi sisirilmesin.
  await currentScope();

  const file = formData.get('document');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Belge secilmedi.' };
  if (!RECEIPT_MIME_TYPES.includes(file.type as ReceiptMimeType)) {
    return { ok: false, error: 'Fotograf (JPG, PNG) ya da PDF yukleyin.' };
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: 'Belge cok buyuk. PDF yerine belgenin fotografini cekin.' };
  }

  try {
    return await readReceiptDocument(db, {
      name: file.name,
      mimeType: file.type as ReceiptMimeType,
      base64: Buffer.from(await file.arrayBuffer()).toString('base64'),
    });
  } catch (error) {
    console.error(error);
    return { ok: false, error: 'Belge okunamadi.' };
  }
}
