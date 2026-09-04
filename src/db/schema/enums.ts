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

/**
 * Siparis satirinin neyi sattigi.
 *
 * `custom`: katalogda olmayan, disaridan yaptirilan urun. Stok karti yok,
 * dolayisiyla rezervasyon ve stok hareketi de yok — ama teslimati takip
 * edilir, yoksa siparis hicbir zaman "teslim edildi" olamazdi.
 */
export const orderLineItemTypeEnum = pgEnum('order_line_item_type', [
  'product',
  'stock_item',
  'custom',
]);
