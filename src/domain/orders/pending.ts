import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
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
import { scopeFilter, type Scope } from '@/domain/scope';
import type { OrderStatus } from './orders';

// Ayni tablo iki kez katiliyor: biri siparisi acan sube, digeri o subenin
// bagli oldugu depo. Takma ad olmadan Postgres ikisini ayirt edemez.
const warehouse = alias(branches, 'warehouse');

export interface PendingItem {
  /** Serbest satirda bos: katalogda karsiligi olan bir stok karti yok. */
  stockItemId: string | null;
  stockItemName: string;
  stockItemSku: string;
  sizeLabel: string | null;
  variantLabel: string | null;
  quantity: number;
}

export interface PendingOrderSummary {
  orderId: string;
  orderNo: string;
  customerName: string;
  branchName: string;
  plannedDeliveryDate: string | null;
  status: OrderStatus;
  items: PendingItem[];
  /** Bu sipariste bekleyen toplam parca adedi. */
  pendingPieces: number;
}

export interface PendingTotal extends PendingItem {
  /** Parcanin beklendigi depo. */
  warehouseId: string;
  warehouseName: string;
  /** O depodaki fiili adet. Serbest satirda takip edilen bir stok yok. */
  onHand: number | null;
  /** Bekleyen adet depodakini asiyorsa aradaki fark; yoksa sifir. */
  shortage: number;
}

export interface PendingOverview {
  orders: PendingOrderSummary[];
  /** Butun bekleyen siparislerin parca parca toplami. */
  totals: PendingTotal[];
  totalPieces: number;
}

/**
 * Bekleyen siparisler ve iclerinden henuz cikmamis parcalar.
 *
 * "Bekleyen" = onaylanmis ya da kismen teslim edilmis siparislerdeki teslim
 * edilmemis bilesenler. Taslak siparisler sayilmaz: stogu etkilemiyorlar ve
 * musteriye soz verilmis sayilmazlar.
 *
 * `totals` uretim/satin alma listesi olarak okunuyor: "su an ne borcluyuz,
 * elimizde ne var". Bu yuzden depodaki adetle karsilastirilip eksik
 * isaretleniyor — ve **depo basina** toplaniyor: ayni parcanin iki farkli
 * depodaki adedi tek satirda toplansaydi "eksik" rakami anlamsiz cikardi.
 * Iki sube ayni depoyu paylasiyorsa tek satirda birlesirler, ki dogrusu da
 * budur: ayni raftan bekliyorlar.
 */
export async function getPendingOverview(db: DbOrTx, scope: Scope): Promise<PendingOverview> {
  const orderRows = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      plannedDeliveryDate: orders.plannedDeliveryDate,
      customerName: customers.name,
      branchName: branches.name,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .where(
      and(
        inArray(orders.status, ['confirmed', 'partially_delivered']),
        scopeFilter(scope, orders.branchId),
      ),
    )
    // Tarihi girilmemis siparisler sona: teslimat tarihi olanlar once bakilir.
    // `asc()` sarmalayicisi kullanilamiyor — yon ve NULL sirasi tek ifade.
    .orderBy(sql`${orders.plannedDeliveryDate} asc nulls last`, asc(orders.orderNo));

  if (orderRows.length === 0) return { orders: [], totals: [], totalPieces: 0 };

  const componentRows = await db
    .select({
      orderId: orderLines.orderId,
      warehouseId: branches.stockBranchId,
      warehouseName: warehouse.name,
      componentId: orderLineComponents.id,
      stockItemId: orderLineComponents.stockItemId,
      lineDescription: orderLines.description,
      remaining: sql<number>`(${orderLineComponents.totalQuantity} - ${orderLineComponents.deliveredQuantity})::int`,
      stockItemName: stockItems.name,
      stockItemSku: stockItems.sku,
      sizeLabel: stockItems.sizeLabel,
      variantLabel: stockItems.variantLabel,
      onHand: stockBalances.quantityOnHand,
    })
    .from(orderLineComponents)
    .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .innerJoin(warehouse, eq(warehouse.id, branches.stockBranchId))
    // leftJoin: serbest satirin stok karti yok ama musteri onu da bekliyor.
    .leftJoin(stockItems, eq(stockItems.id, orderLineComponents.stockItemId))
    // Adet **siparisin** deposundan okunuyor. leftJoin, cunku bakiye satiri
    // hic acilmamis olabilir: o kart o subede sifir adet demektir.
    .leftJoin(
      stockBalances,
      and(
        eq(stockBalances.stockItemId, orderLineComponents.stockItemId),
        eq(stockBalances.branchId, branches.stockBranchId),
      ),
    )
    .where(
      and(
        inArray(
          orderLines.orderId,
          orderRows.map((row) => row.id),
        ),
        sql`${orderLineComponents.totalQuantity} > ${orderLineComponents.deliveredQuantity}`,
      ),
    )
    .orderBy(asc(stockItems.name), asc(stockItems.sizeLabel));

  const summaries: PendingOrderSummary[] = orderRows.map((row) => {
    // Ayni parca birden fazla satirda gecebilir (iki set ayni basligi
    // iceriyorsa); musterinin listesinde tek satirda toplanir.
    const merged = new Map<string, PendingItem>();

    for (const component of componentRows.filter((c) => c.orderId === row.id)) {
      // Serbest satirlar stok kartina gore birlestirilemez; her biri kendi
      // bilesen kimligiyle ayri kaliyor.
      const key = component.stockItemId ?? `serbest:${component.componentId}`;
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += Number(component.remaining);
        continue;
      }
      merged.set(key, {
        stockItemId: component.stockItemId,
        stockItemName: component.stockItemName ?? component.lineDescription,
        stockItemSku: component.stockItemSku ?? '',
        sizeLabel: component.sizeLabel,
        variantLabel: component.variantLabel,
        quantity: Number(component.remaining),
      });
    }

    const items = [...merged.values()];
    return {
      orderId: row.id,
      orderNo: row.orderNo,
      customerName: row.customerName,
      branchName: row.branchName,
      plannedDeliveryDate: row.plannedDeliveryDate,
      status: row.status,
      items,
      pendingPieces: items.reduce((sum, item) => sum + item.quantity, 0),
    };
  });

  const totalsMap = new Map<string, PendingTotal>();
  for (const component of componentRows) {
    // Farkli siparislerdeki ayni serbest urun adi tek satirda toplaniyor:
    // "2 adet ozel sehpa" atolyeye tek is olarak gidiyor.
    const name = component.stockItemName ?? component.lineDescription;
    const key = `${component.warehouseId}:${component.stockItemId ?? `serbest:${name}`}`;
    const existing = totalsMap.get(key);
    if (existing) {
      existing.quantity += Number(component.remaining);
      continue;
    }
    totalsMap.set(key, {
      stockItemId: component.stockItemId,
      stockItemName: name,
      stockItemSku: component.stockItemSku ?? '',
      sizeLabel: component.sizeLabel,
      variantLabel: component.variantLabel,
      quantity: Number(component.remaining),
      warehouseId: component.warehouseId,
      warehouseName: component.warehouseName,
      // Serbest satirin stok karti yok: adedi takip edilmiyor. Karti olan ama
      // bakiye satiri acilmamis parca ise sifir adet demektir.
      onHand: component.stockItemId === null ? null : (component.onHand ?? 0),
      shortage: 0,
    });
  }

  const totals = [...totalsMap.values()]
    .map((item) => ({
      ...item,
      // Serbest urunun stogu takip edilmiyor; eksik hesabi anlamsiz olurdu.
      shortage: item.onHand == null ? 0 : Math.max(0, item.quantity - item.onHand),
    }))
    .sort((a, b) => {
      // Eksikler basa: bu liste "ne yaptiracagiz" sorusunu cevapliyor.
      if (a.shortage !== b.shortage) return b.shortage - a.shortage;
      return a.stockItemName.localeCompare(b.stockItemName, 'tr-TR');
    });

  return {
    orders: summaries,
    totals,
    totalPieces: totals.reduce((sum, item) => sum + item.quantity, 0),
  };
}
