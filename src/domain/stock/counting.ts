import { and, eq } from 'drizzle-orm';
import { stockBalances, stockItems } from '@/db/schema';
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
 *
 * Sayim her zaman sayan subenin deposunda yapilir; kimse baska subenin
 * rafini sayamaz.
 */
export async function adjustStockCount(
  db: DbOrTx,
  branchId: string,
  input: StockCountInput,
): Promise<StockCountResult> {
  if (input.countedQuantity < 0) {
    throw new Error('Sayilan adet negatif olamaz.');
  }

  const [item] = await db
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(eq(stockItems.id, input.stockItemId));

  if (!item) throw new NotFoundError(`Stok karti (${input.stockItemId})`);

  const [balance] = await db
    .select({ onHand: stockBalances.quantityOnHand })
    .from(stockBalances)
    .where(
      and(
        eq(stockBalances.branchId, branchId),
        eq(stockBalances.stockItemId, input.stockItemId),
      ),
    );

  // Bakiye satiri hic acilmamis olabilir: o kart bu subede hic hareket
  // gormemis demektir, adedi sifirdir.
  const previous = balance?.onHand ?? 0;
  const difference = input.countedQuantity - previous;

  if (difference !== 0) {
    await applyMovements(
      db,
      branchId,
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

  return { previous, counted: input.countedQuantity, difference };
}
