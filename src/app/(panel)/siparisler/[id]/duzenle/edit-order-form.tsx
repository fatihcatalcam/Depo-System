'use client';

import { updateOrderAction } from '../../actions';
import type { OrderCatalog } from '@/domain/orders/catalog';
import type { Currency } from '@/lib/money';
import {
  OrderForm,
  type OrderFormValues,
  type OrderSubmitInput,
  type RateOption,
  type SalespersonOption,
} from '../../order-form';

interface Props {
  orderId: string;
  initial: OrderFormValues;
  salespeople: SalespersonOption[];
  catalog: OrderCatalog;
  rates?: Partial<Record<Currency, RateOption>>;
}

export function EditOrderForm({ orderId, initial, salespeople, catalog, rates }: Props) {
  async function submit(input: OrderSubmitInput) {
    return updateOrderAction(orderId, {
      // Musteri degistirildiyse yeni secim gider; degismediyse ayni kimlik
      // gider ve alan katmani dokunmaz.
      customerId: input.customerId,
      newCustomerName: input.newCustomerName,
      receiptNo: input.receiptNo,
      orderDate: input.orderDate,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
      // Bos string bilerek gonderiliyor: saticiyi kaldirmak da bir secim.
      salespersonId: input.salespersonId,
      plannedDeliveryDate: input.plannedDeliveryDate,
      deliveryAddress: input.deliveryAddress,
      deliveryCity: input.deliveryCity,
      deliveryDistrict: input.deliveryDistrict,
      deliveryCountry: input.deliveryCountry,
      deliveryPhone: input.deliveryPhone ?? '',
      deliveryPhone2: input.deliveryPhone2 ?? '',
      deliveryNotes: input.deliveryNotes ?? '',
      discount: input.discount ?? '',
      // Bos string bilerek gonderiliyor: "otomatik hesaba don" demek.
      manualTotal: input.manualTotal ?? '',
      invoiceTitle: input.invoiceTitle ?? '',
      invoiceTaxOffice: input.invoiceTaxOffice ?? '',
      invoiceTaxNumber: input.invoiceTaxNumber ?? '',
      invoiceAddress: input.invoiceAddress ?? '',
      invoiceNo: input.invoiceNo ?? '',
      invoiceDate: input.invoiceDate ?? '',
      notes: input.notes ?? '',
      // Teslim edilen satirlar kimligiyle gidiyor; alan katmani onlari
      // oldugu gibi korur, digerlerini yeniden yazar.
      lines: input.lines,
    }).then((result) => ({ ...result, id: orderId }));
  }

  return (
    <OrderForm
      salespeople={salespeople}
      catalog={catalog}
      rates={rates}
      initial={initial}
      submitLabel="Değişiklikleri kaydet"
      onSubmit={submit}
    />
  );
}
