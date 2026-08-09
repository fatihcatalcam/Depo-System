'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { listProducts } from '@/domain/catalog/products';
import { searchStockItems } from '@/domain/catalog/stock-items';
import { createDelivery } from '@/domain/orders/deliveries';
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  updateOrder,
} from '@/domain/orders/orders';
import { addPayment, deletePayment } from '@/domain/orders/payments';
import { searchCustomers } from '@/domain/parties/parties';
import { DomainError, NegativeStockError } from '@/lib/errors';
import { parseTlInput } from '@/lib/money';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
  /** Stok yetersizken kullaniciya "yine de teslim et" sorabilmek icin. */
  needsStockOverride?: boolean;
}

function toResult(error: unknown): ActionResult {
  if (error instanceof NegativeStockError) {
    return { ok: false, error: error.message, needsStockOverride: true };
  }
  if (error instanceof DomainError) return { ok: false, error: error.message };
  if (error instanceof Error && error.message.startsWith('Gecersiz tutar')) {
    return { ok: false, error: 'Tutar bicimi hatali. Ornek: 15.000,00' };
  }
  console.error(error);
  return { ok: false, error: 'Beklenmeyen bir hata olustu.' };
}

function refresh(orderId?: string) {
  revalidatePath('/siparisler');
  revalidatePath('/stok');
  revalidatePath('/');
  if (orderId) revalidatePath(`/siparisler/${orderId}`);
}

const lineSchema = z.object({
  itemType: z.enum(['product', 'stock_item']),
  productId: z.uuid().nullable().optional(),
  stockItemId: z.uuid().nullable().optional(),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.string(),
});

const orderSchema = z.object({
  customerId: z.uuid('Musteri secin.'),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih gecersiz.'),
  plannedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  deliveryAddress: z.string().min(1, 'Teslimat adresi girin.'),
  deliveryPhone: z.string().optional(),
  deliveryNotes: z.string().optional(),
  discount: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'En az bir satir ekleyin.'),
});

export async function createOrderAction(input: unknown): Promise<ActionResult> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const order = await createOrder(db, {
      customerId: parsed.data.customerId,
      orderDate: parsed.data.orderDate,
      plannedDeliveryDate: parsed.data.plannedDeliveryDate ?? null,
      deliveryAddress: parsed.data.deliveryAddress,
      deliveryPhone: parsed.data.deliveryPhone,
      deliveryNotes: parsed.data.deliveryNotes,
      notes: parsed.data.notes,
      discountKurus: parsed.data.discount ? parseTlInput(parsed.data.discount) : 0,
      lines: parsed.data.lines.map((line) => ({
        itemType: line.itemType,
        productId: line.productId ?? null,
        stockItemId: line.stockItemId ?? null,
        quantity: line.quantity,
        unitPriceKurus: parseTlInput(line.unitPrice || '0'),
      })),
    });
    refresh();
    return { ok: true, id: order.id };
  } catch (error) {
    return toResult(error);
  }
}

export async function updateOrderAction(id: string, input: unknown): Promise<ActionResult> {
  const parsed = orderSchema.partial({ customerId: true, orderDate: true }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await updateOrder(db, id, {
      plannedDeliveryDate: parsed.data.plannedDeliveryDate ?? null,
      deliveryAddress: parsed.data.deliveryAddress,
      deliveryPhone: parsed.data.deliveryPhone,
      deliveryNotes: parsed.data.deliveryNotes,
      notes: parsed.data.notes,
      discountKurus: parsed.data.discount ? parseTlInput(parsed.data.discount) : 0,
      lines: parsed.data.lines?.map((line) => ({
        itemType: line.itemType,
        productId: line.productId ?? null,
        stockItemId: line.stockItemId ?? null,
        quantity: line.quantity,
        unitPriceKurus: parseTlInput(line.unitPrice || '0'),
      })),
    });
    refresh(id);
    return { ok: true, id };
  } catch (error) {
    return toResult(error);
  }
}

export async function confirmOrderAction(id: string): Promise<ActionResult> {
  try {
    await confirmOrder(db, id);
    refresh(id);
    return { ok: true, id };
  } catch (error) {
    return toResult(error);
  }
}

export async function cancelOrderAction(id: string): Promise<ActionResult> {
  try {
    await cancelOrder(db, id);
    refresh(id);
    return { ok: true, id };
  } catch (error) {
    return toResult(error);
  }
}

const deliverySchema = z.object({
  deliveredBy: z.string().optional(),
  receiverName: z.string().optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().min(1),
  allowNegativeStock: z.boolean().optional(),
  lines: z
    .array(z.object({ orderLineComponentId: z.uuid(), quantity: z.coerce.number().int().min(1) }))
    .min(1, 'Teslim edilecek en az bir parca secin.'),
});

export async function createDeliveryAction(
  orderId: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = deliverySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const delivery = await createDelivery(db, { orderId, ...parsed.data });
    refresh(orderId);
    return { ok: true, id: delivery.id };
  } catch (error) {
    return toResult(error);
  }
}

const paymentSchema = z.object({
  amount: z.string().min(1, 'Tutar girin.'),
  method: z.enum(['nakit', 'havale', 'kart', 'cek']),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih gecersiz.'),
  notes: z.string().optional(),
});

export async function addPaymentAction(orderId: string, input: unknown): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await addPayment(db, {
      orderId,
      amountKurus: parseTlInput(parsed.data.amount),
      method: parsed.data.method,
      paidAt: parsed.data.paidAt,
      notes: parsed.data.notes,
    });
    refresh(orderId);
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

export async function deletePaymentAction(
  orderId: string,
  paymentId: string,
): Promise<ActionResult> {
  try {
    await deletePayment(db, paymentId);
    refresh(orderId);
    return { ok: true };
  } catch (error) {
    return toResult(error);
  }
}

/** Siparis satiri eklerken kullanilan arama. */
export async function searchOrderItemsAction(query: string) {
  const trimmed = query.trim();
  const [productList, stockList] = await Promise.all([
    listProducts(db),
    trimmed.length >= 2 ? searchStockItems(db, { query: trimmed, limit: 15 }) : Promise.resolve([]),
  ]);

  const lowered = trimmed.toLocaleLowerCase('tr-TR');
  return {
    products: productList
      .filter((product) => !trimmed || product.name.toLocaleLowerCase('tr-TR').includes(lowered))
      .slice(0, 15)
      .map((product) => ({
        id: product.id,
        name: product.name,
        code: product.code,
        defaultPriceKurus: product.defaultPriceKurus,
      })),
    stockItems: stockList.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      sizeLabel: item.sizeLabel,
      variantLabel: item.variantLabel,
    })),
  };
}

export async function searchCustomersAction(query: string) {
  const list = await searchCustomers(db, { query, limit: 15 });
  return list.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
  }));
}
