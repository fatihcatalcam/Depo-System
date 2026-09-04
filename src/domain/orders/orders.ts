import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  branches,
  customers,
  orderLineComponents,
  orderLines,
  orders,
  payments,
  productComponents,
  products,
  stockItems,
} from '@/db/schema';
import type { DbOrTx, Tx } from '@/db/types';
import { createCustomer } from '@/domain/parties/parties';
import { requireBranch, scopeFilter, type Scope } from '@/domain/scope';
import { getReservedQuantities } from '@/domain/stock/availability';
import { applyMovements } from '@/domain/stock/movements';
import { nextDocumentNumber } from '@/lib/counters';
import { DomainError, NotFoundError } from '@/lib/errors';

export type Order = typeof orders.$inferSelect;
export type OrderStatus = Order['status'];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Taslak',
  confirmed: 'Onaylandi',
  partially_delivered: 'Kismen teslim',
  delivered: 'Teslim edildi',
  cancelled: 'Iptal',
};

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: 'Odenmedi',
  partial: 'Kismen odendi',
  paid: 'Odendi',
};

export interface OrderLineInput {
  itemType: 'product' | 'stock_item' | 'custom';
  /** itemType'a gore biri dolu olmali; `custom` satirda ikisi de bos. */
  productId?: string | null;
  stockItemId?: string | null;
  /**
   * Yalnizca `custom` satirlarda zorunlu: katalogda olmayan, disaridan
   * yaptirilan urunun adi. Diger tiplerde urun/parca adindan turetilir.
   */
  description?: string;
  quantity: number;
  /**
   * Hediye satirlarda da gonderilebilir; urunun degeri olarak saklanir ama
   * satir toplamina girmez.
   */
  unitPriceKurus: number;
  /**
   * Hediye. Musteriden para alinmaz; mal yine cikar.
   *
   * Fiyata 0 yazmaktan farki: niyet kayda geciyor (0 bir veri girisi hatasi da
   * olabilir), ciktida "Hediye" yaziyor ve verilen urunun degeri
   * `unitPriceKurus` icinde korunuyor.
   */
  isGift?: boolean;
}

export interface NewCustomerInput {
  name: string;
  phone?: string | null;
  address?: string | null;
}

export interface CreateOrderInput {
  /** Kayitli musteri. Yoksa `newCustomer` verilmeli. */
  customerId?: string;
  /**
   * Depoya gelen musteri icin onceden kayit acmak gerekmesin diye: isim
   * yazilirsa musteri siparisle ayni transaction icinde olusturulur.
   * Boylece listeye girer, bir dahakine bulunur ve cari bakiyesi tutulur.
   */
  newCustomer?: NewCustomerInput;
  /** ISO tarih (YYYY-MM-DD). */
  orderDate: string;
  plannedDeliveryDate?: string | null;
  deliveryAddress: string;
  deliveryPhone?: string | null;
  /** Ikinci telefon: sofor birine ulasamazsa digerini arar. */
  deliveryPhone2?: string | null;
  deliveryNotes?: string | null;
  discountKurus?: number;
  notes?: string | null;
  lines: OrderLineInput[];
}

export async function createOrder(
  db: DbOrTx,
  scope: Scope,
  input: CreateOrderInput,
): Promise<Order> {
  validateLines(input.lines);

  const address = input.deliveryAddress.trim();
  if (address === '') throw new DomainError('Teslimat adresi bos olamaz.', 'INVALID_INPUT');

  const branch = requireBranch(scope);

  return runInTransaction(db, async (tx) => {
    const customerId = await resolveCustomer(tx, scope, input);

    const orderNo = await nextDocumentNumber(tx, 'order', {
      branchCode: branch.code,
      year: Number(input.orderDate.slice(0, 4)),
    });
    const resolved = await resolveLines(tx, input.lines);
    const totals = computeTotals(resolved, input.discountKurus ?? 0);

    const [order] = await tx
      .insert(orders)
      .values({
        branchId: branch.id,
        orderNo,
        customerId,
        orderDate: input.orderDate,
        plannedDeliveryDate: input.plannedDeliveryDate ?? null,
        deliveryAddress: address,
        deliveryPhone: input.deliveryPhone?.trim() || null,
        deliveryPhone2: input.deliveryPhone2?.trim() || null,
        deliveryNotes: input.deliveryNotes?.trim() || null,
        notes: input.notes?.trim() || null,
        discountKurus: input.discountKurus ?? 0,
        subtotalKurus: totals.subtotal,
        totalKurus: totals.total,
      })
      .returning();

    await insertLines(tx, order.id, resolved);
    return order;
  });
}

export interface UpdateOrderInput {
  /** ISO tarih (YYYY-MM-DD). */
  orderDate?: string;
  plannedDeliveryDate?: string | null;
  deliveryAddress?: string;
  deliveryPhone?: string | null;
  deliveryPhone2?: string | null;
  deliveryNotes?: string | null;
  discountKurus?: number;
  notes?: string | null;
  /** Verilirse satirlar tamamen bununla degistirilir. */
  lines?: OrderLineInput[];
}

export async function updateOrder(
  db: DbOrTx,
  scope: Scope,
  id: string,
  input: UpdateOrderInput,
): Promise<Order> {
  return runInTransaction(db, async (tx) => {
    const existing = await loadOrder(tx, scope, id);

    if (existing.status === 'cancelled' || existing.status === 'delivered') {
      throw new DomainError(
        `${ORDER_STATUS_LABELS[existing.status]} durumundaki siparis duzenlenemez.`,
        'IMMUTABLE_ORDER',
      );
    }

    if (input.lines) {
      validateLines(input.lines);
      await assertNothingDelivered(tx, id);
    }

    const address = input.deliveryAddress?.trim() ?? existing.deliveryAddress;
    if (address === '') throw new DomainError('Teslimat adresi bos olamaz.', 'INVALID_INPUT');

    let subtotal = existing.subtotalKurus;

    if (input.lines) {
      const resolved = await resolveLines(tx, input.lines);
      // Satirlar degisti: bilesenler de yeniden yazilmali. Cascade ile
      // eski bilesenler siliniyor, onayliysa yenileri donduruluyor.
      await tx.delete(orderLines).where(eq(orderLines.orderId, id));
      await insertLines(tx, id, resolved);
      if (existing.status !== 'draft') await freezeComponents(tx, id);
      subtotal = computeTotals(resolved, 0).subtotal;
    }

    const discount = input.discountKurus ?? existing.discountKurus;
    if (discount < 0) throw new DomainError('Iskonto negatif olamaz.', 'INVALID_DISCOUNT');
    if (discount > subtotal) {
      throw new DomainError('Iskonto ara toplamdan buyuk olamaz.', 'INVALID_DISCOUNT');
    }

    const [order] = await tx
      .update(orders)
      .set({
        orderDate: input.orderDate ?? existing.orderDate,
        plannedDeliveryDate:
          input.plannedDeliveryDate !== undefined
            ? input.plannedDeliveryDate
            : existing.plannedDeliveryDate,
        deliveryAddress: address,
        deliveryPhone:
          input.deliveryPhone !== undefined
            ? input.deliveryPhone?.trim() || null
            : existing.deliveryPhone,
        deliveryPhone2:
          input.deliveryPhone2 !== undefined
            ? input.deliveryPhone2?.trim() || null
            : existing.deliveryPhone2,
        deliveryNotes:
          input.deliveryNotes !== undefined
            ? input.deliveryNotes?.trim() || null
            : existing.deliveryNotes,
        notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
        discountKurus: discount,
        subtotalKurus: subtotal,
        totalKurus: subtotal - discount,
        updatedAt: sql`now()`,
      })
      .where(eq(orders.id, id))
      .returning();

    return order;
  });
}

/**
 * Siparisi onaylar ve urun recetelerini `order_line_components` tablosuna
 * dondurur. Bu andan sonra urun tanimi degisse bile siparis, musteriye
 * soz verilen malzemeyi gostermeye devam eder.
 */
export async function confirmOrder(db: DbOrTx, scope: Scope, id: string): Promise<Order> {
  return runInTransaction(db, async (tx) => {
    const existing = await loadOrder(tx, scope, id);
    if (existing.status !== 'draft') {
      throw new DomainError('Yalnizca taslak siparisler onaylanabilir.', 'INVALID_STATUS');
    }

    const lineCount = await tx.select().from(orderLines).where(eq(orderLines.orderId, id));
    if (lineCount.length === 0) {
      throw new DomainError('Bos siparis onaylanamaz.', 'EMPTY_ORDER');
    }

    await freezeComponents(tx, id);

    const [order] = await tx
      .update(orders)
      .set({ status: 'confirmed', updatedAt: sql`now()` })
      .where(eq(orders.id, id))
      .returning();
    return order;
  });
}

/**
 * Siparisi iptal eder. Rezervasyon kendiliginden duser (durum artik
 * rezervasyon uretmiyor). Teslim edilmis miktar varsa `return` tipi
 * hareketle stoga geri alinir — sessizce kaybolmasin diye.
 */
export async function cancelOrder(db: DbOrTx, scope: Scope, id: string): Promise<Order> {
  return runInTransaction(db, async (tx) => {
    const existing = await loadOrder(tx, scope, id);
    if (existing.status === 'cancelled') return existing;

    const delivered = await tx
      .select({
        id: orderLineComponents.id,
        stockItemId: orderLineComponents.stockItemId,
        deliveredQuantity: orderLineComponents.deliveredQuantity,
      })
      .from(orderLineComponents)
      .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
      .where(and(eq(orderLines.orderId, id), sql`${orderLineComponents.deliveredQuantity} > 0`));

    if (delivered.length > 0) {
      // Serbest satirda iade alinacak stok yok.
      await applyMovements(
        tx,
        delivered.flatMap((row) =>
          row.stockItemId === null
            ? []
            : [
                {
                  stockItemId: row.stockItemId,
                  quantityChange: row.deliveredQuantity,
                  movementType: 'return' as const,
                  referenceType: 'order',
                  referenceId: id,
                  notes: `${existing.orderNo} iptal edildi, teslim edilen mal iade alindi.`,
                },
              ],
        ),
      );

      for (const row of delivered) {
        await tx
          .update(orderLineComponents)
          .set({ deliveredQuantity: 0 })
          .where(eq(orderLineComponents.id, row.id));
      }
    }

    const [order] = await tx
      .update(orders)
      .set({ status: 'cancelled', updatedAt: sql`now()` })
      .where(eq(orders.id, id))
      .returning();
    return order;
  });
}

export interface OrderComponentDetail {
  id: string;
  /** Serbest satirda bos: katalogda karsiligi olan bir stok karti yok. */
  stockItemId: string | null;
  stockItemName: string;
  stockItemSku: string;
  /** Katalogda olmayan, disaridan yaptirilan urun. Stogu takip edilmez. */
  isCustom: boolean;
  sizeLabel: string | null;
  variantLabel: string | null;
  quantityPerUnit: number;
  totalQuantity: number;
  deliveredQuantity: number;
  remainingQuantity: number;
  /** Serbest stok; taslakta ve onaylida eksik uyarisi icin. */
  availableQuantity: number;
}

export interface OrderLineDetail {
  id: string;
  lineNo: number;
  itemType: 'product' | 'stock_item' | 'custom';
  productId: string | null;
  stockItemId: string | null;
  description: string;
  quantity: number;
  unitPriceKurus: number;
  lineTotalKurus: number;
  isGift: boolean;
  components: OrderComponentDetail[];
}

export interface OrderDetail extends Order {
  customerName: string;
  customerPhone: string | null;
  lines: OrderLineDetail[];
  paidKurus: number;
  balanceKurus: number;
  paymentStatus: PaymentStatus;
}

export async function getOrder(db: DbOrTx, scope: Scope, id: string): Promise<OrderDetail> {
  const [row] = await db
    .select({ order: orders, customerName: customers.name, customerPhone: customers.phone })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orders.id, id), scopeFilter(scope, orders.branchId)));

  if (!row) throw new NotFoundError('Siparis');

  const lines = await db
    .select()
    .from(orderLines)
    .where(eq(orderLines.orderId, id))
    .orderBy(orderLines.lineNo);

  const components = lines.length
    ? await db
        .select({
          component: orderLineComponents,
          stockItemName: stockItems.name,
          stockItemSku: stockItems.sku,
          sizeLabel: stockItems.sizeLabel,
          variantLabel: stockItems.variantLabel,
          onHand: stockItems.quantityOnHand,
        })
        .from(orderLineComponents)
        // leftJoin: serbest satirin stok karti yok, satir yine de gorunmeli.
        .leftJoin(stockItems, eq(stockItems.id, orderLineComponents.stockItemId))
        .where(
          inArray(
            orderLineComponents.orderLineId,
            lines.map((line) => line.id),
          ),
        )
    : [];

  const reserved = await getReservedQuantities(
    db,
    components.flatMap((entry) =>
      entry.component.stockItemId === null ? [] : [entry.component.stockItemId],
    ),
  );

  const paidKurus = await getPaidTotal(db, id);
  const balanceKurus = row.order.totalKurus - paidKurus;

  return {
    ...row.order,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    paidKurus,
    balanceKurus,
    paymentStatus: derivePaymentStatus(row.order.totalKurus, paidKurus),
    lines: lines.map((line) => ({
      id: line.id,
      lineNo: line.lineNo,
      itemType: line.itemType,
      productId: line.productId,
      stockItemId: line.stockItemId,
      description: line.description,
      quantity: line.quantity,
      unitPriceKurus: line.unitPriceKurus,
      lineTotalKurus: line.lineTotalKurus,
      isGift: line.isGift,
      components: components
        .filter((entry) => entry.component.orderLineId === line.id)
        .map((entry) => {
          const stockItemId = entry.component.stockItemId;
          const isCustom = stockItemId === null;
          const remainingQuantity =
            entry.component.totalQuantity - entry.component.deliveredQuantity;

          return {
            id: entry.component.id,
            stockItemId,
            // Serbest satirin stok karti yok; adi siparis satirindan geliyor.
            stockItemName: entry.stockItemName ?? line.description,
            stockItemSku: entry.stockItemSku ?? '',
            isCustom,
            sizeLabel: entry.sizeLabel,
            variantLabel: entry.variantLabel,
            quantityPerUnit: entry.component.quantityPerUnit,
            totalQuantity: entry.component.totalQuantity,
            deliveredQuantity: entry.component.deliveredQuantity,
            remainingQuantity,
            // Serbest satirda "yetersiz stok" uyarisi anlamsiz olurdu:
            // takip edilen bir stok yok. Kalan adet kadar musait sayiyoruz.
            availableQuantity: isCustom
              ? remainingQuantity
              : (entry.onHand ?? 0) - (reserved.get(stockItemId) ?? 0),
          };
        }),
    })),
  };
}

export interface OrderSummary extends Order {
  customerName: string;
  /** Yonetici listesinde sutun olarak gosterilir; sube kendi adini gormez. */
  branchName: string;
  paidKurus: number;
  balanceKurus: number;
  paymentStatus: PaymentStatus;
}

export interface OrderFilters {
  status?: OrderStatus;
  customerId?: string;
  plannedDeliveryDate?: string;
  /** Yalnizca yonetici icin anlamli: tek subeye daraltir. */
  branchId?: string;
  limit?: number;
}

export async function listOrders(
  db: DbOrTx,
  scope: Scope,
  filters: OrderFilters = {},
): Promise<OrderSummary[]> {
  const conditions = [scopeFilter(scope, orders.branchId)];
  if (filters.status) conditions.push(eq(orders.status, filters.status));
  if (filters.customerId) conditions.push(eq(orders.customerId, filters.customerId));
  if (filters.plannedDeliveryDate) {
    conditions.push(eq(orders.plannedDeliveryDate, filters.plannedDeliveryDate));
  }
  // Yonetici tek subeyi suzmek isteyebilir; kapsam zaten genis oldugu icin bu
  // ek bir yetki acmaz, yalnizca daraltir.
  if (filters.branchId) conditions.push(eq(orders.branchId, filters.branchId));

  const rows = await db
    .select({
      order: orders,
      customerName: customers.name,
      branchName: branches.name,
      paid: sql<number>`coalesce((
        select sum(${payments.amountKurus}) from ${payments}
        where ${payments.orderId} = ${orders.id}
      ), 0)::bigint`,
    })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .innerJoin(branches, eq(branches.id, orders.branchId))
    .where(and(...conditions))
    .orderBy(desc(orders.orderDate), desc(orders.createdAt))
    .limit(filters.limit ?? 200);

  return rows.map((row) => {
    const paidKurus = Number(row.paid);
    return {
      ...row.order,
      customerName: row.customerName,
      branchName: row.branchName,
      paidKurus,
      balanceKurus: row.order.totalKurus - paidKurus,
      paymentStatus: derivePaymentStatus(row.order.totalKurus, paidKurus),
    };
  });
}

export async function getPaidTotal(db: DbOrTx, orderId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${payments.amountKurus}), 0)::bigint` })
    .from(payments)
    .where(eq(payments.orderId, orderId));
  return Number(row?.total ?? 0);
}

export function derivePaymentStatus(totalKurus: number, paidKurus: number): PaymentStatus {
  if (paidKurus <= 0) return 'unpaid';
  if (paidKurus >= totalKurus) return 'paid';
  return 'partial';
}

/** Teslimat sonrasi siparis durumunu bilesenlerden yeniden hesaplar. */
export async function recalcOrderStatus(tx: Tx, orderId: string): Promise<OrderStatus> {
  const rows = await tx
    .select({
      total: orderLineComponents.totalQuantity,
      delivered: orderLineComponents.deliveredQuantity,
    })
    .from(orderLineComponents)
    .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
    .where(eq(orderLines.orderId, orderId));

  const deliveredSum = rows.reduce((sum, row) => sum + row.delivered, 0);
  const totalSum = rows.reduce((sum, row) => sum + row.total, 0);

  const status: OrderStatus =
    deliveredSum === 0 ? 'confirmed' : deliveredSum >= totalSum ? 'delivered' : 'partially_delivered';

  await tx.update(orders).set({ status, updatedAt: sql`now()` }).where(eq(orders.id, orderId));
  return status;
}

/**
 * Siparisin musterisini bulur ya da olusturur.
 *
 * Ayni isimde kayitli musteri olsa bile sessizce onu kullanmiyoruz: iki farkli
 * "Mehmet Yilmaz" birlestirilirse siparis gecmisi ve bakiye birbirine karisir.
 * Bu, listede mukerrer kayit olmasindan daha kotu. Secimi arayuz kullaniciya
 * yaptiriyor; burada yalnizca ne soylendiyse o yapiliyor.
 */
async function resolveCustomer(tx: Tx, scope: Scope, input: CreateOrderInput): Promise<string> {
  if (input.customerId) {
    // Kapsam suzgeci sart: aksi halde diger subenin musteri kimligini
    // gonderen biri kendi siparisini o musteriye baglayabilir ve boylece
    // musterinin varligini ogrenirdi.
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), scopeFilter(scope, customers.branchId)));
    if (!customer) throw new NotFoundError('Musteri');
    return customer.id;
  }

  const name = input.newCustomer?.name?.trim() ?? '';
  if (name === '') {
    throw new DomainError(
      'Kayitli bir musteri secin veya yeni musteri adi girin.',
      'CUSTOMER_REQUIRED',
    );
  }

  const created = await createCustomer(tx, scope, {
    name,
    phone: input.newCustomer?.phone ?? null,
    address: input.newCustomer?.address ?? null,
  });
  return created.id;
}

interface ResolvedLine extends OrderLineInput {
  description: string;
  lineTotalKurus: number;
}

async function resolveLines(tx: Tx, lines: OrderLineInput[]): Promise<ResolvedLine[]> {
  const productIds = lines.flatMap((line) => (line.productId ? [line.productId] : []));
  const stockItemIds = lines.flatMap((line) => (line.stockItemId ? [line.stockItemId] : []));

  const productRows = productIds.length
    ? await tx.select().from(products).where(inArray(products.id, productIds))
    : [];
  const stockRows = stockItemIds.length
    ? await tx.select().from(stockItems).where(inArray(stockItems.id, stockItemIds))
    : [];

  return lines.map((line) => {
    let description: string;

    if (line.itemType === 'custom') {
      // Katalogda karsiligi yok; ad dogrudan kullanicinin yazdigi metin.
      description = (line.description ?? '').trim();
    } else if (line.itemType === 'product') {
      const product = productRows.find((row) => row.id === line.productId);
      if (!product) throw new NotFoundError('Urun');
      description = product.name;
    } else {
      const item = stockRows.find((row) => row.id === line.stockItemId);
      if (!item) throw new NotFoundError('Stok karti');
      description = [item.name, item.sizeLabel, item.variantLabel].filter(Boolean).join(' · ');
    }

    // Hediye satirin toplami her zaman sifir; birim fiyat urunun degeri
    // olarak duruyor.
    const lineTotalKurus = line.isGift ? 0 : line.unitPriceKurus * line.quantity;

    return { ...line, description, lineTotalKurus };
  });
}

async function insertLines(tx: Tx, orderId: string, lines: ResolvedLine[]) {
  await tx.insert(orderLines).values(
    lines.map((line, index) => ({
      orderId,
      lineNo: index + 1,
      itemType: line.itemType,
      productId: line.itemType === 'product' ? (line.productId as string) : null,
      stockItemId: line.itemType === 'stock_item' ? (line.stockItemId as string) : null,
      description: line.description,
      quantity: line.quantity,
      unitPriceKurus: line.unitPriceKurus,
      lineTotalKurus: line.lineTotalKurus,
      isGift: line.isGift ?? false,
    })),
  );
}

/** Urun recetelerini siparis satirlarina kopyalar (dondurma). */
async function freezeComponents(tx: Tx, orderId: string) {
  const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, orderId));
  if (lines.length === 0) return;

  await tx.delete(orderLineComponents).where(
    inArray(
      orderLineComponents.orderLineId,
      lines.map((line) => line.id),
    ),
  );

  const productLineIds = lines.flatMap((line) => (line.productId ? [line.productId] : []));
  const recipes = productLineIds.length
    ? await tx
        .select()
        .from(productComponents)
        .where(inArray(productComponents.productId, productLineIds))
    : [];

  const values: (typeof orderLineComponents.$inferInsert)[] = [];

  for (const line of lines) {
    if (line.itemType === 'custom') {
      // Stok karti olmasa da bilesen satiri yaziyoruz: teslimat takibi ve
      // durum hesabi bu tablodan yuruyor. Yazilmasaydi yalnizca serbest
      // satirdan olusan bir siparis hicbir zaman "teslim edildi" olamazdi.
      values.push({
        orderLineId: line.id,
        stockItemId: null,
        quantityPerUnit: 1,
        totalQuantity: line.quantity,
      });
      continue;
    }

    if (line.itemType === 'stock_item') {
      // Tek parca satisinda da bilesen yaziyoruz; teslimat mantigi tek yoldan isler.
      values.push({
        orderLineId: line.id,
        stockItemId: line.stockItemId as string,
        quantityPerUnit: 1,
        totalQuantity: line.quantity,
      });
      continue;
    }

    const recipe = recipes.filter((row) => row.productId === line.productId);
    if (recipe.length === 0) {
      throw new DomainError(
        `"${line.description}" urununun recetesi bos, siparis onaylanamaz.`,
        'EMPTY_RECIPE',
      );
    }

    for (const component of recipe) {
      values.push({
        orderLineId: line.id,
        stockItemId: component.stockItemId,
        quantityPerUnit: component.quantity,
        totalQuantity: component.quantity * line.quantity,
      });
    }
  }

  if (values.length > 0) await tx.insert(orderLineComponents).values(values);
}

async function assertNothingDelivered(tx: Tx, orderId: string) {
  const rows = await tx
    .select({ delivered: orderLineComponents.deliveredQuantity })
    .from(orderLineComponents)
    .innerJoin(orderLines, eq(orderLines.id, orderLineComponents.orderLineId))
    .where(and(eq(orderLines.orderId, orderId), sql`${orderLineComponents.deliveredQuantity} > 0`));

  if (rows.length > 0) {
    throw new DomainError(
      'Teslimati baslamis siparisin satirlari degistirilemez.',
      'ALREADY_DELIVERED',
    );
  }
}

function computeTotals(lines: ResolvedLine[], discountKurus: number) {
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotalKurus, 0);
  if (discountKurus < 0) throw new DomainError('Iskonto negatif olamaz.', 'INVALID_DISCOUNT');
  if (discountKurus > subtotal) {
    throw new DomainError('Iskonto ara toplamdan buyuk olamaz.', 'INVALID_DISCOUNT');
  }
  return { subtotal, total: subtotal - discountKurus };
}

function validateLines(lines: OrderLineInput[]) {
  if (lines.length === 0) throw new DomainError('Siparis en az bir satir icermeli.', 'EMPTY_ORDER');

  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new DomainError('Adet sifirdan buyuk tam sayi olmali.', 'INVALID_QUANTITY');
    }
    if (line.unitPriceKurus < 0) {
      throw new DomainError('Birim fiyat negatif olamaz.', 'INVALID_PRICE');
    }
    if (line.itemType === 'product' && !line.productId) {
      throw new DomainError('Urun satirinda urun secilmeli.', 'INVALID_LINE');
    }
    if (line.itemType === 'stock_item' && !line.stockItemId) {
      throw new DomainError('Parca satirinda parca secilmeli.', 'INVALID_LINE');
    }
    if (line.itemType === 'custom' && !line.description?.trim()) {
      throw new DomainError('Serbest satirda urun adi yazilmali.', 'INVALID_LINE');
    }
  }
}

/**
 * Siparis degistiren her islemin tek giris noktasi. Kapsam suzgeci burada
 * oldugu icin, yeni bir islem eklendiginde izolasyonu ayrica dusunmek
 * gerekmiyor: baska subenin siparisi zaten "bulunamadi" doner.
 */
async function loadOrder(tx: Tx, scope: Scope, id: string): Promise<Order> {
  const [row] = await tx
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), scopeFilter(scope, orders.branchId)));
  if (!row) throw new NotFoundError('Siparis');
  return row;
}

async function runInTransaction<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const maybeTx = db as Partial<Tx>;
  if (typeof maybeTx.rollback === 'function') return fn(db as Tx);
  return (db as { transaction: <R>(cb: (tx: Tx) => Promise<R>) => Promise<R> }).transaction(fn);
}
