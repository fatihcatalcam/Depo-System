import { pgEnum } from 'drizzle-orm/pg-core';

export const orderStatusEnum = pgEnum('order_status', [
  'draft',
  'confirmed',
  'partially_delivered',
  'delivered',
  'cancelled',
]);

export const paymentMethodEnum = pgEnum('payment_method', ['nakit', 'havale', 'kart', 'cek']);

/**
 * Siparisin para birimi.
 *
 * Bazi siparisler dolar ya da euro uzerinden aliniyor. Secim siparisin
 * tamamini kapsar: satir fiyatlari, genel toplam ve tahsilatlar hep ayni
 * birimden.
 */
export const currencyEnum = pgEnum('currency', ['TRY', 'USD', 'EUR']);

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
