'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db/client';
import { listProducts } from '@/domain/catalog/products';
import { searchStockItems } from '@/domain/catalog/stock-items';
import { createDelivery, deliverRemaining } from '@/domain/orders/deliveries';
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  updateOrder,
} from '@/domain/orders/orders';
import { addPayment, deletePayment } from '@/domain/orders/payments';
import { searchCustomers } from '@/domain/parties/parties';
import { currentScope } from '@/lib/auth/current';
import { DomainError, NegativeStockError } from '@/lib/errors';
import { parseRateInput, parseTlInput, TRY_RATE, type Currency } from '@/lib/money';

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
  revalidatePath('/siparisler/bekleyen');
  // Teslimat ve iptal gunluk sevkiyat listesini de degistiriyor.
  revalidatePath('/sevkiyat');
  revalidatePath('/stok');
  revalidatePath('/');
  if (orderId) revalidatePath(`/siparisler/${orderId}`);
}

const lineSchema = z.object({
  itemType: z.enum(['product', 'stock_item', 'custom']),
  productId: z.uuid().nullable().optional(),
  stockItemId: z.uuid().nullable().optional(),
  /** Yalnizca serbest satirda dolu. */
  description: z.string().optional(),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.string(),
  isGift: z.boolean().optional(),
});

/** Fatura alanlari hem olusturmada hem duzenlemede ayni. */
const invoiceShape = {
  invoiceTitle: z.string().optional(),
  invoiceTaxOffice: z.string().optional(),
  invoiceTaxNumber: z.string().optional(),
  invoiceAddress: z.string().optional(),
  invoiceNo: z.string().optional(),
  invoiceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fatura tarihi gecersiz.')
    .or(z.literal(''))
    .optional(),
};

/**
 * Bos metin "otomatik hesapla" demek, gonderilmemesi "dokunma" demek.
 * Ikisini ayirmak sart: teslimat planini duzenlemek elle yazilan toplami
 * silmemeli.
 */
function parseManualTotal(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() === '' ? null : parseTlInput(value);
}

/**
 * Formdan gelen para birimi ve kuru alan katmaninin bekledigi bicime cevirir.
 *
 * TL'de kur hic gonderilmez: kuru tanim geregi 1,0000 ve alan katmani onu
 * kendisi koyuyor. Bos birakilmis kur `undefined` olarak geciyor ki
 * "degistirme" ile "sifirla" birbirine karismasin.
 */
function currencyFields(
  currency?: Currency,
  exchangeRate?: string,
): { currency?: Currency; exchangeRate?: number } {
  if (!currency) return {};
  if (currency === 'TRY') return { currency, exchangeRate: TRY_RATE };
  const trimmed = exchangeRate?.trim();
  return { currency, exchangeRate: trimmed ? parseRateInput(trimmed) : undefined };
}

const orderSchema = z.object({
  ...invoiceShape,
  // Yeni sipariste zorunlu: prim buna gore hesaplaniyor, sonradan "bunu kim
  // satmisti" diye hatirlamak mumkun olmuyor.
  salespersonId: z.uuid({ error: 'Satici secin.' }),
  // Ikisinden biri: kayitli musteri ya da yeni musteri adi.
  customerId: z.uuid().optional(),
  newCustomerName: z.string().optional(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih gecersiz.'),
  currency: z.enum(['TRY', 'USD', 'EUR']).optional(),
  exchangeRate: z.string().optional(),
  plannedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  deliveryAddress: z.string().min(1, 'Teslimat adresi girin.'),
  deliveryPhone: z.string().optional(),
  deliveryPhone2: z.string().optional(),
  deliveryNotes: z.string().optional(),
  discount: z.string().optional(),
  manualTotal: z.string().optional(),
  /** Siparis alinirken pesin alinan ucret. */
  deposit: z
    .object({
      amount: z.string().min(1),
      method: z.enum(['nakit', 'havale', 'kart', 'cek']),
    })
    .optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'En az bir satir ekleyin.'),
});

export async function createOrderAction(input: unknown): Promise<ActionResult> {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const newCustomerName = parsed.data.newCustomerName?.trim();
  if (!parsed.data.customerId && !newCustomerName) {
    return { ok: false, error: 'Kayitli bir musteri secin veya yeni musteri adi girin.' };
  }

  try {
    const order = await createOrder(db, await currentScope(), {
      customerId: parsed.data.customerId,
      newCustomer: newCustomerName
        ? {
            name: newCustomerName,
            // Siparis formundaki teslimat bilgileri yeni musteriye de yazilir;
            // bir dahakine adres ve telefon hazir gelir.
            phone: parsed.data.deliveryPhone,
            address: parsed.data.deliveryAddress,
          }
        : undefined,
      orderDate: parsed.data.orderDate,
      ...currencyFields(parsed.data.currency, parsed.data.exchangeRate),
      salespersonId: parsed.data.salespersonId,
      plannedDeliveryDate: parsed.data.plannedDeliveryDate ?? null,
      deliveryAddress: parsed.data.deliveryAddress,
      deliveryPhone: parsed.data.deliveryPhone,
      deliveryPhone2: parsed.data.deliveryPhone2,
      deliveryNotes: parsed.data.deliveryNotes,
      notes: parsed.data.notes,
      discountKurus: parsed.data.discount ? parseTlInput(parsed.data.discount) : 0,
      manualTotalKurus: parseManualTotal(parsed.data.manualTotal),
      invoiceTitle: parsed.data.invoiceTitle,
      invoiceTaxOffice: parsed.data.invoiceTaxOffice,
      invoiceTaxNumber: parsed.data.invoiceTaxNumber,
      invoiceAddress: parsed.data.invoiceAddress,
      invoiceNo: parsed.data.invoiceNo,
      invoiceDate: parsed.data.invoiceDate,
      deposit: parsed.data.deposit
        ? {
            amountKurus: parseTlInput(parsed.data.deposit.amount),
            method: parsed.data.deposit.method,
            paidAt: parsed.data.orderDate,
            notes: 'Kapora',
          }
        : null,
      lines: parsed.data.lines.map((line) => ({
        itemType: line.itemType,
        productId: line.productId ?? null,
        stockItemId: line.stockItemId ?? null,
        description: line.description,
        quantity: line.quantity,
        unitPriceKurus: parseTlInput(line.unitPrice || '0'),
        isGift: line.isGift ?? false,
      })),
    });
    refresh();
    return { ok: true, id: order.id };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * Kismi guncelleme: yalnizca gonderilen alanlar degisir.
 *
 * `lines` istege bagli — teslimat planini duzenlerken satirlar gonderilmez.
 * `discount` da istege bagli ve gonderilmediginde mevcut iskonto korunur;
 * aksi halde adres degistirmek siparisin iskontosunu sifirlardi.
 */
const orderPatchSchema = z.object({
  ...invoiceShape,
  // Duzenlemede bos birakilabilir: alan eklenmeden once acilmis siparislerin
  // saticisi bilinmiyor, tarih duzeltmek icin satici secmek zorunda kalinmasin.
  salespersonId: z.uuid().or(z.literal('')).optional(),
  orderDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih gecersiz.')
    .optional(),
  plannedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  deliveryAddress: z.string().min(1, 'Teslimat adresi girin.').optional(),
  deliveryPhone: z.string().optional(),
  deliveryPhone2: z.string().optional(),
  deliveryNotes: z.string().optional(),
  currency: z.enum(['TRY', 'USD', 'EUR']).optional(),
  exchangeRate: z.string().optional(),
  discount: z.string().optional(),
  manualTotal: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'En az bir satir ekleyin.').optional(),
});

export async function updateOrderAction(id: string, input: unknown): Promise<ActionResult> {
  const parsed = orderPatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await updateOrder(db, await currentScope(), id, {
      orderDate: parsed.data.orderDate,
      salespersonId:
        parsed.data.salespersonId !== undefined ? parsed.data.salespersonId || null : undefined,
      plannedDeliveryDate: parsed.data.plannedDeliveryDate,
      deliveryAddress: parsed.data.deliveryAddress,
      deliveryPhone: parsed.data.deliveryPhone,
      deliveryPhone2: parsed.data.deliveryPhone2,
      deliveryNotes: parsed.data.deliveryNotes,
      notes: parsed.data.notes,
      ...currencyFields(parsed.data.currency, parsed.data.exchangeRate),
      discountKurus:
        parsed.data.discount !== undefined ? parseTlInput(parsed.data.discount || '0') : undefined,
      manualTotalKurus: parseManualTotal(parsed.data.manualTotal),
      invoiceTitle: parsed.data.invoiceTitle,
      invoiceTaxOffice: parsed.data.invoiceTaxOffice,
      invoiceTaxNumber: parsed.data.invoiceTaxNumber,
      invoiceAddress: parsed.data.invoiceAddress,
      invoiceNo: parsed.data.invoiceNo,
      invoiceDate: parsed.data.invoiceDate,
      lines: parsed.data.lines?.map((line) => ({
        itemType: line.itemType,
        productId: line.productId ?? null,
        stockItemId: line.stockItemId ?? null,
        description: line.description,
        quantity: line.quantity,
        unitPriceKurus: parseTlInput(line.unitPrice || '0'),
        isGift: line.isGift ?? false,
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
    await confirmOrder(db, await currentScope(), id);
    refresh(id);
    return { ok: true, id };
  } catch (error) {
    return toResult(error);
  }
}

export async function cancelOrderAction(id: string): Promise<ActionResult> {
  try {
    await cancelOrder(db, await currentScope(), id);
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
    const delivery = await createDelivery(db, await currentScope(), { orderId, ...parsed.data });
    refresh(orderId);
    return { ok: true, id: delivery.id };
  } catch (error) {
    return toResult(error);
  }
}

/**
 * Sevkiyat ekranindaki "Teslim edildi": sipariste kalan ne varsa hepsini
 * teslim eder. Stok yetmiyorsa `needsStockOverride` ile geri doner, kullanici
 * onaylarsa ayni cagri `allowNegativeStock` ile tekrarlanir.
 */
export async function deliverStopAction(
  orderId: string,
  input: { allowNegativeStock?: boolean; receiverName?: string } = {},
): Promise<ActionResult> {
  try {
    const delivery = await deliverRemaining(db, await currentScope(), orderId, {
      allowNegativeStock: input.allowNegativeStock ?? false,
      receiverName: input.receiverName,
    });
    refresh(orderId);
    return { ok: true, id: delivery.id };
  } catch (error) {
    return toResult(error);
  }
}

const paymentSchema = z.object({
  amount: z.string().min(1, 'Tutar girin.'),
  method: z.enum(['nakit', 'havale', 'kart', 'cek']),
  isDeposit: z.boolean().optional(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih gecersiz.'),
  notes: z.string().optional(),
});

export async function addPaymentAction(orderId: string, input: unknown): Promise<ActionResult> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await addPayment(db, await currentScope(), {
      orderId,
      amountKurus: parseTlInput(parsed.data.amount),
      method: parsed.data.method,
      isDeposit: parsed.data.isDeposit ?? false,
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
    await deletePayment(db, await currentScope(), paymentId);
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
  const list = await searchCustomers(db, await currentScope(), { query, limit: 15 });
  return list.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    address: customer.address,
  }));
}
