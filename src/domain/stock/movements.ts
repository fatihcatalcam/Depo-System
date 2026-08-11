import { eq, sql } from 'drizzle-orm';
import { stockItems, stockMovements } from '@/db/schema';
import type { DbOrTx, Tx } from '@/db/types';
import { NegativeStockError, NotFoundError } from '@/lib/errors';

export type MovementType =
  | 'goods_receipt'
  | 'delivery'
  | 'stock_count'
  | 'return'
  | 'scrap'
  | 'manual';

export interface MovementInput {
  stockItemId: string;
  /** Arti giris, eksi cikis. Sifir olamaz. */
  quantityChange: number;
  movementType: MovementType;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
}

export interface ApplyOptions {
  /** Sayim duzeltmesi gibi bilincli durumlar icin stogun eksiye dusmesine izin verir. */
  allowNegative?: boolean;
}

export interface MovementResult {
  stockItemId: string;
  /** Hareketten sonraki kesin bakiye. */
  balanceAfter: number;
}

/**
 * Sistemdeki tum stok degisikliklerinin tek kapisi.
 *
 * Hareket defterine yazar ve quantityOnHand onbellegini ayni transaction
 * icinde gunceller — ikisi asla birbirinden ayrilamaz.
 *
 * Olusan bakiyeleri geri doner: cagiran taraf ekrani guncellemek icin ayrica
 * sorgu atmak zorunda kalmasin. Sonucu yok saymak serbest.
 */
export async function applyMovements(
  db: DbOrTx,
  movements: MovementInput[],
  options: ApplyOptions = {},
): Promise<MovementResult[]> {
  if (movements.length === 0) return [];

  for (const movement of movements) {
    if (movement.quantityChange === 0) {
      throw new Error('Hareket miktari sifir olamaz.');
    }
  }

  // Siralama kilitlenmeyi (deadlock) onler: iki es zamanli islem ayni
  // kartlari hep ayni sirayla kilitler.
  const sorted = [...movements].sort((a, b) => a.stockItemId.localeCompare(b.stockItemId));

  return runInTransaction(db, async (tx) => {
    const results: MovementResult[] = [];

    for (const movement of sorted) {
      const locked = await tx
        .select({ id: stockItems.id, quantityOnHand: stockItems.quantityOnHand })
        .from(stockItems)
        .where(eq(stockItems.id, movement.stockItemId))
        .for('update');

      if (locked.length === 0) {
        throw new NotFoundError(`Stok karti (${movement.stockItemId})`);
      }

      const balanceAfter = locked[0].quantityOnHand + movement.quantityChange;

      if (balanceAfter < 0 && !options.allowNegative) {
        throw new NegativeStockError(
          movement.stockItemId,
          Math.abs(movement.quantityChange),
          locked[0].quantityOnHand,
        );
      }

      await tx.insert(stockMovements).values({
        stockItemId: movement.stockItemId,
        quantityChange: movement.quantityChange,
        movementType: movement.movementType,
        referenceType: movement.referenceType ?? null,
        referenceId: movement.referenceId ?? null,
        balanceAfter,
        notes: movement.notes ?? null,
      });

      await tx
        .update(stockItems)
        .set({ quantityOnHand: balanceAfter, updatedAt: sql`now()` })
        .where(eq(stockItems.id, movement.stockItemId));

      results.push({ stockItemId: movement.stockItemId, balanceAfter });
    }

    return results;
  });
}

/**
 * Zaten bir transaction icindeysek onu kullanir, degilsek yeni acar.
 * Boylece applyMovements hem tek basina hem daha buyuk bir islemin
 * (ornegin teslimat kaydinin) parcasi olarak cagrilabilir.
 */
async function runInTransaction<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const maybeTx = db as Partial<Tx>;
  if (typeof maybeTx.rollback === 'function') {
    return fn(db as Tx);
  }
  return (db as Db).transaction(fn);
}

type Db = { transaction: <T>(cb: (tx: Tx) => Promise<T>) => Promise<T> };
