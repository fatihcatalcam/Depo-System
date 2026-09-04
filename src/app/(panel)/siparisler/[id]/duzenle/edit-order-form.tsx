'use client';

import { updateOrderAction } from '../../actions';
import {
  OrderForm,
  type OrderFormValues,
  type OrderSubmitInput,
} from '../../order-form';

interface Props {
  orderId: string;
  initial: OrderFormValues;
  /** Teslimati baslamis sipariste satirlar gonderilmez. */
  linesLocked: boolean;
}

export function EditOrderForm({ orderId, initial, linesLocked }: Props) {
  async function submit(input: OrderSubmitInput) {
    return updateOrderAction(orderId, {
      orderDate: input.orderDate,
      plannedDeliveryDate: input.plannedDeliveryDate,
      deliveryAddress: input.deliveryAddress,
      deliveryPhone: input.deliveryPhone ?? '',
      deliveryPhone2: input.deliveryPhone2 ?? '',
      deliveryNotes: input.deliveryNotes ?? '',
      discount: input.discount ?? '',
      notes: input.notes ?? '',
      // Teslimat baslamissa satirlari hic gondermiyoruz: alan katmani zaten
      // reddederdi, ama gondermemek hatayi bastan onluyor ve kullanicinin
      // yaptigi diger degisiklikler kaybolmuyor.
      lines: linesLocked ? undefined : input.lines,
    }).then((result) => ({ ...result, id: orderId }));
  }

  return <OrderForm initial={initial} submitLabel="Degisiklikleri kaydet" onSubmit={submit} />;
}
