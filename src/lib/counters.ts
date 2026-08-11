import { sql } from 'drizzle-orm';
import { documentCounters } from '@/db/schema';
import type { DbOrTx } from '@/db/types';

export type DocumentType =
  | 'stockItem'
  | 'product'
  | 'customer'
  | 'supplier'
  | 'goodsReceipt'
  | 'order'
  | 'delivery';

interface CounterConfig {
  prefix: string;
  useYear: boolean;
  /** Subeye ozel belgelerde numara sube basina ilerler. */
  perBranch: boolean;
}

const CONFIG: Record<DocumentType, CounterConfig> = {
  stockItem: { prefix: 'SK', useYear: false, perBranch: false },
  product: { prefix: 'UR', useYear: false, perBranch: false },
  supplier: { prefix: 'TD', useYear: false, perBranch: false },
  customer: { prefix: 'MS', useYear: false, perBranch: true },
  goodsReceipt: { prefix: 'MK', useYear: true, perBranch: true },
  order: { prefix: 'SP', useYear: true, perBranch: true },
  delivery: { prefix: 'TS', useYear: true, perBranch: true },
};

export interface NumberOptions {
  /** Subeye ozel belgelerde zorunlu. Ornek: 'S1' */
  branchCode?: string;
  year?: number;
}

/**
 * Siradaki belge numarasini uretir.
 *
 * Atomiklik INSERT ... ON CONFLICT DO UPDATE ile saglanir: Postgres satiri
 * kilitler, artirir ve yeni degeri doner. Iki kisi ayni anda siparis acsa bile
 * ayni numara iki kez uretilemez.
 *
 * Subeye ozel belgeler sube kodunu tasir (SP-S1-2026-00001) ve her sube kendi
 * dizisinde ilerler; boylece bir subenin numaralarinda diger sube yuzunden
 * bosluk olusmaz.
 */
export async function nextDocumentNumber(
  db: DbOrTx,
  docType: DocumentType,
  options: NumberOptions = {},
): Promise<string> {
  const config = CONFIG[docType];
  const counterYear = config.useYear ? (options.year ?? new Date().getFullYear()) : 0;

  if (config.perBranch && !options.branchCode) {
    throw new Error(`${docType} belgesi icin sube kodu gerekli.`);
  }
  const branchCode = config.perBranch ? options.branchCode! : '';

  const [row] = await db
    .insert(documentCounters)
    .values({ docType, branchCode, year: counterYear, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [documentCounters.docType, documentCounters.branchCode, documentCounters.year],
      set: { lastNumber: sql`${documentCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: documentCounters.lastNumber });

  const sequence = row.lastNumber.toString().padStart(5, '0');

  return [config.prefix, branchCode || null, config.useYear ? counterYear : null, sequence]
    .filter((part) => part !== null)
    .join('-');
}
