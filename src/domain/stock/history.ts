import { desc, eq } from 'drizzle-orm';
import { stockMovements } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import type { MovementType } from './movements';

export interface StockHistoryEntry {
  id: string;
  quantityChange: number;
  movementType: MovementType;
  balanceAfter: number;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: Date;
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  goods_receipt: 'Mal kabul',
  delivery: 'Teslimat',
  stock_count: 'Sayim duzeltme',
  return: 'Iade',
  scrap: 'Fire',
  manual: 'Elle duzeltme',
};

export async function listStockHistory(
  db: DbOrTx,
  stockItemId: string,
  limit = 100,
): Promise<StockHistoryEntry[]> {
  const rows = await db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.stockItemId, stockItemId))
    // seq monoton artiyor; createdAt ayni ana denk gelse bile sira dogru.
    .orderBy(desc(stockMovements.seq))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    quantityChange: row.quantityChange,
    movementType: row.movementType,
    balanceAfter: row.balanceAfter,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    notes: row.notes,
    createdAt: row.createdAt,
  }));
}
