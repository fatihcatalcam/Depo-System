import { and, eq, sql } from 'drizzle-orm';
import { stockBalances, stockItems, stockMovements } from '@/db/schema';
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
 * Hareket defterine yazar ve `stock_balances` onbellegini ayni transaction
 * icinde gunceller — ikisi asla birbirinden ayrilamaz.
 *
 * `warehouseId` **zorunlu ilk parametre**: hangi deponun adedinin degistigi
 * tahmin edilemez. Istege bagli olsaydi, eklemeyi unutan bir cagri yeri
 * sessizce yanlis depoyu degistirirdi.
 *
 * Depo, kaydi giren kisiden degil **belgeden** gelir: bir siparisin mali,
 * siparisi acan subenin bagli oldugu depodan cikar.
 *
 * Olusan bakiyeleri geri doner: cagiran taraf ekrani guncellemek icin ayrica
 * sorgu atmak zorunda kalmasin. Sonucu yok saymak serbest.
 */
export async function applyMovements(
  db: DbOrTx,
  warehouseId: string,
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
      const balance = await lockBalance(tx, warehouseId, movement.stockItemId);
      const balanceAfter = balance + movement.quantityChange;

      if (balanceAfter < 0 && !options.allowNegative) {
        throw new NegativeStockError(
          movement.stockItemId,
          Math.abs(movement.quantityChange),
          balance,
        );
      }

      await tx.insert(stockMovements).values({
        branchId: warehouseId,
        stockItemId: movement.stockItemId,
        quantityChange: movement.quantityChange,
        movementType: movement.movementType,
        referenceType: movement.referenceType ?? null,
        referenceId: movement.referenceId ?? null,
        balanceAfter,
        notes: movement.notes ?? null,
      });

      await tx
        .update(stockBalances)
        .set({ quantityOnHand: balanceAfter, updatedAt: sql`now()` })
        .where(
          and(
            eq(stockBalances.branchId, warehouseId),
            eq(stockBalances.stockItemId, movement.stockItemId),
          ),
        );

      results.push({ stockItemId: movement.stockItemId, balanceAfter });
    }

    return results;
  });
}

/**
 * Deponun o karttaki bakiye satirini kilitler ve adedi doner.
 *
 * Satir yoksa sifirla acilir: her depo her kart icin bos satir tasimiyor,
 * ilk hareket satiri dogurur. Kart yoksa `NotFoundError` — yabanci anahtar
 * ihlali yerine anlasilir bir hata verelim diye once kart araniyor.
 */
async function lockBalance(tx: Tx, warehouseId: string, stockItemId: string): Promise<number> {
  const [item] = await tx
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(eq(stockItems.id, stockItemId));

  if (!item) throw new NotFoundError(`Stok karti (${stockItemId})`);

  await tx
    .insert(stockBalances)
    .values({ branchId: warehouseId, stockItemId, quantityOnHand: 0 })
    .onConflictDoNothing();

  const [row] = await tx
    .select({ quantityOnHand: stockBalances.quantityOnHand })
    .from(stockBalances)
    .where(and(eq(stockBalances.branchId, warehouseId), eq(stockBalances.stockItemId, stockItemId)))
    .for('update');

  return row?.quantityOnHand ?? 0;
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
