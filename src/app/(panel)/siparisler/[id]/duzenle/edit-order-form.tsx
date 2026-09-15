'use client';

import { updateOrderAction } from '../../actions';
import {
  OrderForm,
  type OrderFormValues,
  type OrderSubmitInput,
  type SalespersonOption,
} from '../../order-form';

interface Props {
  orderId: string;
  initial: OrderFormValues;
  salespeople: SalespersonOption[];
  /** Teslimati baslamis sipariste satirlar gonderilmez. */
  linesLocked: boolean;
}

export function EditOrderForm({ orderId, initial, salespeople, linesLocked }: Props) {
  async function submit(input: OrderSubmitInput) {
    return updateOrderAction(orderId, {
      orderDate: input.orderDate,
      // Bos string bilerek gonderiliyor: saticiyi kaldirmak da bir secim.
      salespersonId: input.salespersonId,
      plannedDeliveryDate: input.plannedDeliveryDate,
      deliveryAddress: input.deliveryAddress,
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
      // Teslimat baslamissa satirlari hic gondermiyoruz: alan katmani zaten
      // reddederdi, ama gondermemek hatayi bastan onluyor ve kullanicinin
      // yaptigi diger degisiklikler kaybolmuyor.
      lines: linesLocked ? undefined : input.lines,
    }).then((result) => ({ ...result, id: orderId }));
  }

  return (
    <OrderForm
      salespeople={salespeople}
      initial={initial}
      submitLabel="Degisiklikleri kaydet"
      onSubmit={submit}
    />
  );
}
