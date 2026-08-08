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
}

const CONFIG: Record<DocumentType, CounterConfig> = {
  stockItem: { prefix: 'SK', useYear: false },
  product: { prefix: 'UR', useYear: false },
  customer: { prefix: 'MS', useYear: false },
  supplier: { prefix: 'TD', useYear: false },
  goodsReceipt: { prefix: 'MK', useYear: true },
  order: { prefix: 'SP', useYear: true },
  delivery: { prefix: 'TS', useYear: true },
};

/**
 * Siradaki belge numarasini uretir.
 *
 * Atomiklik INSERT ... ON CONFLICT DO UPDATE ile saglanir: Postgres satiri
 * kilitler, artirir ve yeni degeri doner. Iki kisi ayni anda siparis acsa bile
 * ayni numara iki kez uretilemez.
 */
export async function nextDocumentNumber(
  db: DbOrTx,
  docType: DocumentType,
  year?: number,
): Promise<string> {
  const config = CONFIG[docType];
  const counterYear = config.useYear ? (year ?? new Date().getFullYear()) : 0;

  const [row] = await db
    .insert(documentCounters)
    .values({ docType, year: counterYear, lastNumber: 1 })
    .onConflictDoUpdate({
      target: [documentCounters.docType, documentCounters.year],
      set: { lastNumber: sql`${documentCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: documentCounters.lastNumber });

  const sequence = row.lastNumber.toString().padStart(5, '0');
  return config.useYear
    ? `${config.prefix}-${counterYear}-${sequence}`
    : `${config.prefix}-${sequence}`;
}
