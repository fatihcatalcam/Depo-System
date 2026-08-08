import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'restrict',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    // nullsNotDistinct: Postgres varsayilan olarak NULL'lari birbirinden farkli
    // sayar; o olmadan iki tane kok duzey "Yatak" kategorisi olusturulabilirdi.
    unique('categories_parent_name_uq').on(t.parentId, t.name).nullsNotDistinct(),
    index('categories_parent_idx').on(t.parentId),
  ],
);

export const stockItems = pgTable(
  'stock_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sku: text('sku').notNull().unique(),
    name: text('name').notNull(),
    sizeLabel: text('size_label'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    barcode: text('barcode').unique(),
    unit: text('unit').notNull().default('adet'),
    minStockLevel: integer('min_stock_level').notNull().default(0),
    quantityOnHand: integer('quantity_on_hand').notNull().default(0),
    purchasePriceKurus: bigint('purchase_price_kurus', { mode: 'number' }),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [
    index('stock_items_name_idx').on(t.name),
    index('stock_items_category_idx').on(t.categoryId),
    check('stock_items_min_level_chk', sql`${t.minStockLevel} >= 0`),
  ],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'restrict' }),
    defaultPriceKurus: bigint('default_price_kurus', { mode: 'number' }),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => [index('products_name_idx').on(t.name)],
);

export const productComponents = pgTable(
  'product_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    stockItemId: uuid('stock_item_id')
      .notNull()
      .references(() => stockItems.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
  },
  (t) => [
    unique('product_components_uq').on(t.productId, t.stockItemId),
    check('product_components_qty_chk', sql`${t.quantity} > 0`),
  ],
);
