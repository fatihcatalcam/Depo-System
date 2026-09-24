import { eq } from 'drizzle-orm';
import { branches } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { NotFoundError } from '@/lib/errors';

/**
 * Bir subenin mallarinin durdugu deponun kimligi.
 *
 * Belgeden yuruyen stok hareketleri icin: teslimat ve iptal iadesi
 * **siparisin** subesine bakar, oturumdakine degil, ve adet o subenin
 * bagli oldugu depodan duser.
 *
 * Kendi dosyasinda duruyor, `domain/branches.ts` icinde degil. Sebebi
 * teknik: `branches.ts` parola ozetleme kodunu (`node:crypto`) cagiriyor.
 * Siparis modulu oradan bir sey import ettiginde zincir `orders.ts` →
 * `branches.ts` → `password.ts` diye uzuyor ve istemci bileseni siparis
 * modulunden bir **deger** import ettigi anda Node kodu tarayici paketine
 * giriyor; sayfa "This page couldn't load" ile dusuyor. Bu dosya yalnizca
 * semaya dokunuyor, o zinciri kurmuyor.
 */
export async function warehouseOf(db: DbOrTx, branchId: string): Promise<string> {
  const [row] = await db
    .select({ stockBranchId: branches.stockBranchId })
    .from(branches)
    .where(eq(branches.id, branchId));

  if (!row) throw new NotFoundError('Sube');
  return row.stockBranchId;
}
