import { and, asc, between, eq, inArray, sql } from 'drizzle-orm';
import {
  customers,
  orderLineComponents,
  orderLines,
  orders,
  payments,
  stockItems,
} from '@/db/schema';
import type { DbOrTx } from '@/db/types';
import { addDays, startOfWeek } from '@/lib/dates';
import { toTryKurus, type Currency } from '@/lib/money';
import { scopeFilter, type Scope } from './scope';

export interface ShipmentItem {
  /** Serbest satirda bos: katalogda karsiligi olan bir stok karti yok. */
  stockItemId: string | null;
  stockItemName: string;
  stockItemSku: string;
  sizeLabel: string | null;
  variantLabel: string | null;
  quantity: number;
}

export interface ShipmentStop {
  orderId: string;
  orderNo: string;
  plannedDeliveryDate: string;
  /** Haftalik ozette teslim edilmis duraklar da var; gunluk listede yok. */
  status: 'confirmed' | 'partially_delivered' | 'delivered';
  customerName: string;
  customerPhone: string | null;
  customerPhone2: string | null;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryDistrict: string | null;
  deliveryCountry: string;
  deliveryPhone: string | null;
  deliveryPhone2: string | null;
  deliveryNotes: string | null;
  /** Bu adrese inecek, henuz teslim edilmemis parcalar. */
  items: ShipmentItem[];
  totalKurus: number;
  paidKurus: number;
  /** Sofore "su kadar tahsil et" demek icin. Siparisin kendi para biriminden. */
  balanceKurus: number;
  /** Tutarlarin para birimi; sofor kagidinda dogru simge cikmali. */
  currency: Currency;
  exchangeRate: number;
  /** Fatura bilgisi; haftalik ozette gosteriliyor. Faturasiz sipariste bos. */
  invoice: {
    title: string | null;
    taxOffice: string | null;
    taxNumber: string | null;
    address: string | null;
    no: string | null;
    date: string | null;
  };
}

export interface DailyShipment {
  date: string;
  stops: ShipmentStop[];
  /** Parca parca toplam: depocu araca yuklerken tek kagida bakar. */
  pickingList: ShipmentItem[];
  totalPieces: number;
  totalCollectionKurus: number;
}

/**
 * Bir gunun sevkiyati.
 *
 * Listeye giren siparisler: planlanan teslimat tarihi o gune esit **ve**
 * durumu `confirmed` veya `partially_delivered` olanlar. Her siparis icin
 * yalnizca henuz teslim edilmemis bilesenler gosterilir.
 *
 * Sube kendi sevkiyatini gorur. Yoneticide ikisi birlesir — arac genelde ortak
 * cikiyor, toplama listesinin tek kagit olmasi ise yariyor.
 */
export async function getDailyShipment(
  db: DbOrTx,
  scope: Scope,
  date: string,
): Promise<DailyShipment> {
  const stops = await getShipmentStops(db, scope, date, date, { includeDelivered: false });
  return summarize(date, stops);
}

interface RangeOptions {
  /**
   * Teslim edilmis siparisler de gelsin mi. Gunluk sevkiyat yapilacak isi
   * gosteriyor, teslim edilen dusuyor. Haftalik ozet ise haftanin kaydi:
   * carsamba gunu bakildiginda pazartesinin teslimatlari kaybolmamali.
   */
  includeDelivered: boolean;
}

/**
 * Tarih araligindaki duraklar, teslim tarihine ve siparis numarasina gore.
 * Gunluk ve haftalik sevkiyat ayni sorgudan geciyor: iki ayri yol, zamanla
 * birbirinden farkli sonuc veren iki liste demek.
 */
async function getShipmentStops(
  db: DbOrTx,
  scope: Scope,
  from: string,
  to: string,
  options: RangeOptions,
): Promise<ShipmentStop[]> {
  const statuses = options.includeDelivered
    ? (['confirmed', 'partially_delivered', 'delivered'] as const)
    : (['confirmed', 'partially_delivered'] as const);

  const orderRows = await db
    .select({
      order: orders,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerPhone2: customers.phone2,
      paid: sql<number>`coalesce((
        select sum(${payments.amountKurus}) from ${payments}
        where ${payments.orderId} = ${orders.id}
      ), 0)::bigint`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(
      and(
        between(orders.plannedDeliveryDate, from, to),
        inArray(orders.status, [...statuses]),
        scopeFilter(scope, orders.branchId),
      ),
    )
    .orderBy(asc(orders.plannedDeliveryDate), asc(orders.orderNo));

  if (orderRows.length === 0) return [];

  const componentRows = await db
    .select({
      orderId: orderLines.orderId,
      componentId: orderLineComponents.id,
      stockItemId: orderLineComponents.stockItemId,
      lineDescription: orderLines.description,
      // Teslim edilmis sipariste kalan sifir; ozette ne gittigi gorunsun diye
      // tamami. Digerlerinde sofore gidecek olan: kalan.
      remaining: sql<number>`(case when ${orders.status} = 'delivered'
        then ${orderLineComponents.totalQuantity}
        else ${orderLineComponents.totalQuantity} - ${orderLineComponents.deliveredQuantity} end)::int`,
      stockItemName: stockItems.name,
      stockItemSku: stockItems.sku,
      sizeLabel: stockItems.sizeLabel,
      variantLabel: stockItems.variantLabel,
    })
    .from(orderLineComponents)
    .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    // leftJoin: serbest satirin stok karti yok ama sofor onu da goturuyor.
    // innerJoin olsaydi disaridan yaptirilan urun toplama listesinden duserdi.
    .leftJoin(stockItems, eq(stockItems.id, orderLineComponents.stockItemId))
    .where(
      and(
        inArray(
          orderLines.orderId,
          orderRows.map((row) => row.order.id),
        ),
        sql`(${orderLineComponents.totalQuantity} > ${orderLineComponents.deliveredQuantity} or ${orders.status} = 'delivered')`,
      ),
    )
    .orderBy(asc(stockItems.name), asc(stockItems.sizeLabel));

  return orderRows.map((row): ShipmentStop => {
    // Ayni parca birden fazla satirda olabilir (ornegin iki farkli set ayni
    // baslıgi iceriyorsa); durak listesinde tek satirda toplanir.
    const merged = new Map<string, ShipmentItem>();

    for (const component of componentRows.filter((c) => c.orderId === row.order.id)) {
      // Serbest satirlar stok kartina gore birlestirilemez (karti yok);
      // her biri kendi bilesen kimligiyle ayri satir kaliyor.
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

    const paidKurus = Number(row.paid);
    return {
      orderId: row.order.id,
      orderNo: row.order.orderNo,
      // Aralik sorgusu teslim tarihi olanlari getiriyor; bos olamaz.
      plannedDeliveryDate: row.order.plannedDeliveryDate as string,
      status: row.order.status as ShipmentStop['status'],
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      customerPhone2: row.customerPhone2,
      deliveryAddress: row.order.deliveryAddress,
      deliveryCity: row.order.deliveryCity,
      deliveryDistrict: row.order.deliveryDistrict,
      deliveryCountry: row.order.deliveryCountry,
      deliveryPhone: row.order.deliveryPhone,
      deliveryPhone2: row.order.deliveryPhone2,
      deliveryNotes: row.order.deliveryNotes,
      items: [...merged.values()],
      totalKurus: row.order.totalKurus,
      paidKurus,
      balanceKurus: row.order.totalKurus - paidKurus,
      currency: row.order.currency,
      exchangeRate: row.order.exchangeRate,
      invoice: {
        title: row.order.invoiceTitle,
        taxOffice: row.order.invoiceTaxOffice,
        taxNumber: row.order.invoiceTaxNumber,
        address: row.order.invoiceAddress,
        no: row.order.invoiceNo,
        date: row.order.invoiceDate,
      },
    };
  });
}

/** Tahsil edilecek toplam, TL karsiligi: duraklar farkli para birimlerinden olabilir. */
function collectionTotal(stops: ShipmentStop[]): number {
  return stops.reduce(
    (sum, stop) =>
      stop.status === 'delivered'
        ? sum
        : sum + Math.max(0, toTryKurus(stop.balanceKurus, stop.exchangeRate)),
    0,
  );
}

function summarize(date: string, stops: ShipmentStop[]): DailyShipment {
  const picking = new Map<string, ShipmentItem>();
  for (const stop of stops) {
    for (const item of stop.items) {
      // Farkli siparislerdeki ayni serbest urun adini birlestiriyoruz;
      // depocu icin "2 adet ozel sehpa" tek satir olmali.
      const key = item.stockItemId ?? `serbest:${item.stockItemName}`;
      const existing = picking.get(key);
      if (existing) existing.quantity += item.quantity;
      else picking.set(key, { ...item });
    }
  }

  const pickingList = [...picking.values()].sort((a, b) =>
    a.stockItemName.localeCompare(b.stockItemName, 'tr-TR'),
  );

  return {
    date,
    stops,
    pickingList,
    totalPieces: pickingList.reduce((sum, item) => sum + item.quantity, 0),
    totalCollectionKurus: collectionTotal(stops),
  };
}

export interface WeeklyShipment {
  /** Pazartesi. */
  weekStart: string;
  /** Pazar. */
  weekEnd: string;
  /** Pazartesiden pazara yedi gun; sevkiyati olmayan gun bos listeyle. */
  days: { date: string; stops: ShipmentStop[] }[];
  totalStops: number;
  /** Henuz teslim edilmemis duraklardan tahsil edilecek, TL karsiligi. */
  totalCollectionKurus: number;
}

/**
 * Haftalik sevkiyat ozeti: verilen tarihin haftasi, pazartesiden pazara.
 * Sofor kagitlari gibi durak durak; teslim edilmis duraklar da haftanin
 * kaydi olarak listede.
 */
export async function getWeeklyShipment(
  db: DbOrTx,
  scope: Scope,
  anyDateInWeek: string,
): Promise<WeeklyShipment> {
  const weekStart = startOfWeek(anyDateInWeek);
  const weekEnd = addDays(weekStart, 6);
  const stops = await getShipmentStops(db, scope, weekStart, weekEnd, { includeDelivered: true });

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return { date, stops: stops.filter((stop) => stop.plannedDeliveryDate === date) };
  });

  return {
    weekStart,
    weekEnd,
    days,
    totalStops: stops.length,
    totalCollectionKurus: collectionTotal(stops),
  };
}
