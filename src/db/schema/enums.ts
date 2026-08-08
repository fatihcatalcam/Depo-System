import { pgEnum } from 'drizzle-orm/pg-core';

export const orderStatusEnum = pgEnum('order_status', [
  'draft',
  'confirmed',
  'partially_delivered',
  'delivered',
  'cancelled',
]);

export const paymentMethodEnum = pgEnum('payment_method', ['nakit', 'havale', 'kart', 'cek']);

export const movementTypeEnum = pgEnum('movement_type', [
  'goods_receipt',
  'delivery',
  'stock_count',
  'return',
  'scrap',
  'manual',
]);

export const orderLineItemTypeEnum = pgEnum('order_line_item_type', ['product', 'stock_item']);
