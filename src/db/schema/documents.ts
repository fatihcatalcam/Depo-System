import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { branches } from './branches';
import { products, stockItems } from './catalog';
import { orderLineItemTypeEnum, orderStatusEnum, paymentMethodEnum } from './enums';
import { customers, suppliers } from './parties';

/**
 * Mal kabul. `branchId` yalnizca "hangi sube kaydetti" bilgisidir; stok tek
 * havuz oldugu icin girisin etkisi her iki sube tarafindan gorulur.
 */
export const goodsReceipts = pgTable(
  'goods_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    receiptNo: text('receipt_no').notNull().unique(),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'restrict' }),
    waybillNo: text('waybill_no'),
    receivedAt: date('received_at').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('goods_receipts_branch_idx').on(t.branchId)],
);

export const goodsReceiptLines = pgTable(
  'goods_receipt_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    goodsReceiptId: uuid('goods_receipt_id')
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: 'cascade' }),
    stockItemId: uuid('stock_item_id')
      .notNull()
      .references(() => stockItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
    unitCostKurus: bigint('unit_cost_kurus', { mode: 'number' }),
  },
  (t) => [check('goods_receipt_lines_qty_chk', sql`${t.quantity} > 0`)],
);

/**
 * Siparis subeye ozeldir.
 *
 * `deliveries` ve `payments` ayrica `branchId` tasimaz — subelerini bagli
 * olduklari siparisten alirlar. Ikinci bir dogruluk kaynagi, ikisinin
 * birbirinden ayrilma ihtimali demektir.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id, { onDelete: 'restrict' }),
    orderNo: text('order_no').notNull().unique(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    orderDate: date('order_date').notNull(),
    plannedDeliveryDate: date('planned_delivery_date'),
    // Anlik kopya: musteri adresini sonradan degistirse bile siparis nereye
    // gittiyse orada kalir.
    deliveryAddress: text('delivery_address').notNull(),
    deliveryPhone: text('delivery_phone'),
    deliveryNotes: text('delivery_notes'),
    status: orderStatusEnum('status').notNull().default('draft'),
    subtotalKurus: bigint('subtotal_kurus', { mode: 'number' }).notNull().default(0),
    discountKurus: bigint('discount_kurus', { mode: 'number' }).notNull().default(0),
    totalKurus: bigint('total_kurus', { mode: 'number' }).notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('orders_branch_status_idx').on(t.branchId, t.status, t.plannedDeliveryDate),
    index('orders_status_delivery_idx').on(t.status, t.plannedDeliveryDate),
    index('orders_customer_idx').on(t.customerId),
    check('orders_discount_chk', sql`${t.discountKurus} >= 0`),
  ],
);

export const orderLines = pgTable(
  'order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    lineNo: integer('line_no').notNull(),
    itemType: orderLineItemTypeEnum('item_type').notNull(),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }),
    stockItemId: uuid('stock_item_id').references(() => stockItems.id, { onDelete: 'restrict' }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull(),
    /**
     * Hediye satirlarda da dolu kalir: urunun degeri kaydedilsin diye. Satirin
     * musteriye yansiyan tutari `lineTotalKurus`, o sifirlanir. Boylece
     * "bu ay ne kadar hediye verdik" sorusu sonradan cevaplanabilir.
     */
    unitPriceKurus: bigint('unit_price_kurus', { mode: 'number' }).notNull().default(0),
    lineTotalKurus: bigint('line_total_kurus', { mode: 'number' }).notNull().default(0),
    /**
     * Hediye satir. Musteriden para alinmaz ama mal cikar: stoktan duser,
     * rezerve edilir, toplama listesinde ve sofor kagidinda gorunur. Hediye
     * olmasi bedava olmasi demek, yok sayilmasi degil.
     */
    isGift: boolean('is_gift').notNull().default(false),
  },
  (t) => [
    index('order_lines_order_idx').on(t.orderId),
    check('order_lines_qty_chk', sql`${t.quantity} > 0`),
    // Hediye satirin musteriye yansiyan tutari her zaman sifir olmali;
    // arayuzde bir yerde unutulursa veritabani kabul etmesin.
    check('order_lines_gift_total_chk', sql`NOT ${t.isGift} OR ${t.lineTotalKurus} = 0`),
    check(
      'order_lines_item_ref_chk',
      sql`(${t.itemType} = 'product' AND ${t.productId} IS NOT NULL AND ${t.stockItemId} IS NULL)
          OR (${t.itemType} = 'stock_item' AND ${t.stockItemId} IS NOT NULL AND ${t.productId} IS NULL)`,
    ),
  ],
);

/**
 * Dondurulmus recete. Siparis onaylandigi anda urun recetesi buraya kopyalanir
 * ve bir daha urun tanimina bakilmaz. Rezervasyon ve teslimat hesaplari
 * yalnizca bu tablodan yurur.
 */
export const orderLineComponents = pgTable(
  'order_line_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderLineId: uuid('order_line_id')
      .notNull()
      .references(() => orderLines.id, { onDelete: 'cascade' }),
    stockItemId: uuid('stock_item_id')
      .notNull()
      .references(() => stockItems.id, { onDelete: 'restrict' }),
    quantityPerUnit: integer('quantity_per_unit').notNull(),
    totalQuantity: integer('total_quantity').notNull(),
    deliveredQuantity: integer('delivered_quantity').notNull().default(0),
  },
  (t) => [
    unique('order_line_components_uq').on(t.orderLineId, t.stockItemId),
    index('order_line_components_stock_idx').on(t.stockItemId),
    check('olc_qty_chk', sql`${t.quantityPerUnit} > 0 AND ${t.totalQuantity} > 0`),
    check(
      'olc_delivered_chk',
      sql`${t.deliveredQuantity} >= 0 AND ${t.deliveredQuantity} <= ${t.totalQuantity}`,
    ),
  ],
);

export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  deliveryNo: text('delivery_no').notNull().unique(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'restrict' }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }).notNull(),
  deliveredBy: text('delivered_by'),
  receiverName: text('receiver_name'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Teslimat satiri bilesen seviyesindedir, siparis satiri seviyesinde degil:
// "yatak bugun gitti, baza hafta sonu" senaryosunun karsiligi budur.
export const deliveryLines = pgTable(
  'delivery_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deliveryId: uuid('delivery_id')
      .notNull()
      .references(() => deliveries.id, { onDelete: 'cascade' }),
    orderLineComponentId: uuid('order_line_component_id')
      .notNull()
      .references(() => orderLineComponents.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
  },
  (t) => [check('delivery_lines_qty_chk', sql`${t.quantity} > 0`)],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    amountKurus: bigint('amount_kurus', { mode: 'number' }).notNull(),
    method: paymentMethodEnum('method').notNull(),
    paidAt: date('paid_at').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_order_idx').on(t.orderId),
    check('payments_amount_chk', sql`${t.amountKurus} > 0`),
  ],
);
