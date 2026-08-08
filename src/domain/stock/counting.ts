import { eq } from 'drizzle-orm';
import { stockItems } from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { NotFoundError } from '@/lib/errors';
import { applyMovements } from './movements';

export interface StockCountInput {
  stockItemId: string;
  /** Depoda fiilen sayilan adet. */
  countedQuantity: number;
  notes?: string | null;
}

export interface StockCountResult {
  previous: number;
  counted: number;
  difference: number;
}

/**
 * Sayim duzeltmesi. Fark her zaman hareket defterinde iz birakir —
 * stok sessizce degismez, "neden degisti" sorusu her zaman cevaplanabilir.
 */
export async function adjustStockCount(
  db: DbOrTx,
  input: StockCountInput,
): Promise<StockCountResult> {
  if (input.countedQuantity < 0) {
    throw new Error('Sayilan adet negatif olamaz.');
  }

  const [item] = await db
    .select({ onHand: stockItems.quantityOnHand })
    .from(stockItems)
    .where(eq(stockItems.id, input.stockItemId));

  if (!item) throw new NotFoundError(`Stok karti (${input.stockItemId})`);

  const difference = input.countedQuantity - item.onHand;

  if (difference !== 0) {
    await applyMovements(
      db,
      [
        {
          stockItemId: input.stockItemId,
          quantityChange: difference,
          movementType: 'stock_count',
          notes: input.notes ?? null,
        },
      ],
      { allowNegative: true },
    );
  }

  return { previous: item.onHand, counted: input.countedQuantity, difference };
}
