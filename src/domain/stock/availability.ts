import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  branches,
  customers,
  orderLineComponents,
  orderLines,
  orders,
  stockBalances,
  stockItems,
} from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { isInScope, type Scope } from '@/domain/scope';
import { NotFoundError } from '@/lib/errors';

/** Rezervasyon ureten siparis durumlari. */
export const RESERVING_STATUSES = ['confirmed', 'partially_delivered'] as const;

export interface Availability {
  /** Depodaki fiziksel adet. */
  onHand: number;
  /** Soz verilmis ama henuz teslim edilmemis adet. */
  reserved: number;
  /** Yeni siparise verilebilecek adet. Negatif olabilir: fazla soz verilmis demektir. */
  available: number;
}

/**
 * Bir **deponun** adetleri.
 *
 * Parametre sube degil depo: birden fazla sube ayni depodan satabilir
 * (`branches.stock_branch_id`). Bakiye satiri olmayan kart sifir sayilir;
 * `stock_balances` her depo icin her kartin satirini tasimaz, ilk hareketle
 * dogar.
 */
export async function getOnHandQuantities(
  db: DbOrTx,
  warehouseId: string,
  stockItemIds?: string[],
): Promise<Map<string, number>> {
  if (stockItemIds && stockItemIds.length === 0) return new Map();

  const conditions = [eq(stockBalances.branchId, warehouseId)];
  if (stockItemIds) conditions.push(inArray(stockBalances.stockItemId, stockItemIds));

  const rows = await db
    .select({
      stockItemId: stockBalances.stockItemId,
      quantityOnHand: stockBalances.quantityOnHand,
    })
    .from(stockBalances)
    .where(and(...conditions));

  return new Map(rows.map((row) => [row.stockItemId, row.quantityOnHand]));
}

/**
 * Rezerve miktarlar ayri bir tabloda tutulmaz, her seferinde siparislerden
 * hesaplanir. Boylece "rezervasyon tablosu ile siparis tablosunun birbirinden
 * kaymasi" diye bir hata sinifi hic dogmaz.
 *
 * Hesap **depoya** baglidir, subeye degil: ayni depodan satan butun subelerin
 * rezervasyonlari toplanir. Subeye baglasaydik, tek depoyu paylasan iki sube
 * ayni yatagi ikisi de satardi — sistemin cozmesi gereken asil sorun bu.
 */
export async function getReservedQuantities(
  db: DbOrTx,
  warehouseId: string,
  stockItemIds?: string[],
): Promise<Map<string, number>> {
  if (stockItemIds && stockItemIds.length === 0) return new Map();

  // Serbest satirlarin (katalogda olmayan urun) stok karti yok; rezervasyon
  // hesabina hic girmemeleri gerekiyor, yoksa gruplama null bir anahtar uretir.
  const conditions = [
    eq(branches.stockBranchId, warehouseId),
    inArray(orders.status, [...RESERVING_STATUSES]),
    isNotNull(orderLineComponents.stockItemId),
  ];
  if (stockItemIds) {
    conditions.push(inArray(orderLineComponents.stockItemId, stockItemIds));
  }

  const rows = await db
    .select({
      stockItemId: orderLineComponents.stockItemId,
      reserved: sql<number>`sum(${orderLineComponents.totalQuantity} - ${orderLineComponents.deliveredQuantity})::int`,
    })
    .from(orderLineComponents)
    .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .where(and(...conditions))
    .groupBy(orderLineComponents.stockItemId);

  return new Map(rows.map((row) => [row.stockItemId as string, Number(row.reserved)]));
}

export interface ReservationLine {
  /** Kendi kapsamindaki siparisse siparis numarasi, degilse null. */
  orderNo: string | null;
  orderId: string | null;
  /** Kendi kapsamindaki siparisse musteri adi, degilse "Diger sube". */
  label: string;
  quantity: number;
}

/**
 * Bir parcayi kimin rezerve ettigi.
 *
 * Depo paylasildigi icin listede baska subenin siparisleri de cikar. Kendi
 * goremeyecegi siparisler tek satirda "Diger sube" olarak toplanir: depocu
 * stogun neden yetmedigini anlar ama satis bilgisi karsiya gecmez. Merkez
 * zaten butun siparisleri yonettigi icin onda hepsi adiyla gorunur.
 */
export async function getReservationBreakdown(
  db: DbOrTx,
  scope: Scope,
  stockItemId: string,
): Promise<ReservationLine[]> {
  const rows = await db
    .select({
      orderId: orders.id,
      orderNo: orders.orderNo,
      branchId: orders.branchId,
      customerName: customers.name,
      quantity: sql<number>`sum(${orderLineComponents.totalQuantity} - ${orderLineComponents.deliveredQuantity})::int`,
    })
    .from(orderLineComponents)
    .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        eq(branches.stockBranchId, scope.stockBranchId),
        eq(orderLineComponents.stockItemId, stockItemId),
        inArray(orders.status, [...RESERVING_STATUSES]),
        sql`${orderLineComponents.totalQuantity} > ${orderLineComponents.deliveredQuantity}`,
      ),
    )
    .groupBy(orders.id, orders.orderNo, orders.branchId, customers.name)
    .orderBy(orders.orderNo);

  const mine: ReservationLine[] = [];
  let otherBranches = 0;

  for (const row of rows) {
    if (isInScope(scope, row.branchId)) {
      mine.push({
        orderId: row.orderId,
        orderNo: row.orderNo,
        label: row.customerName,
        quantity: Number(row.quantity),
      });
    } else {
      otherBranches += Number(row.quantity);
    }
  }

  if (otherBranches > 0) {
    mine.push({ orderId: null, orderNo: null, label: 'Diger sube', quantity: otherBranches });
  }

  return mine;
}

export async function getAvailability(
  db: DbOrTx,
  warehouseId: string,
  stockItemId: string,
): Promise<Availability> {
  const [item] = await db
    .select({ id: stockItems.id })
    .from(stockItems)
    .where(eq(stockItems.id, stockItemId));

  if (!item) throw new NotFoundError(`Stok karti (${stockItemId})`);

  const onHand = (await getOnHandQuantities(db, warehouseId, [stockItemId])).get(stockItemId) ?? 0;
  const reserved =
    (await getReservedQuantities(db, warehouseId, [stockItemId])).get(stockItemId) ?? 0;

  return { onHand, reserved, available: onHand - reserved };
}
