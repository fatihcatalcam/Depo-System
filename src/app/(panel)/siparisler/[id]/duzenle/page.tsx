import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { ORDER_STATUS_LABELS, getOrder } from '@/domain/orders/orders';
import { currentScope } from '@/lib/auth/current';
import { NotFoundError } from '@/lib/errors';
import { kurusToTl } from '@/lib/money';
import { EditOrderForm } from './edit-order-form';

function toTlInput(kurus: number): string {
  if (kurus === 0) return '';
  return kurusToTl(kurus).toFixed(2).replace('.', ',');
}

export default async function SiparisDuzenlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scope = await currentScope();

  let order;
  try {
    order = await getOrder(db, scope, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  // Teslim edilmis ya da iptal siparis degistirilemez; alan katmani da
  // reddediyor, kullaniciyi bos yere forma sokmayalim.
  if (order.status === 'delivered' || order.status === 'cancelled') {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">{order.orderNo}</h1>
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          {ORDER_STATUS_LABELS[order.status]} durumundaki siparis duzenlenemez.
        </p>
        <Link href={`/siparisler/${id}`} className="text-sm text-neutral-500 hover:underline">
          Siparise don
        </Link>
      </div>
    );
  }

  const deliveredAny = order.lines.some((line) =>
    line.components.some((component) => component.deliveredQuantity > 0),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">{order.orderNo} · duzenle</h1>
        <p className="text-sm text-neutral-500">
          {order.customerName} · {ORDER_STATUS_LABELS[order.status]}
        </p>
      </div>

      {deliveredAny ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Bu siparisin bir kismi teslim edildi. Tarih, adres ve telefon
          degistirilebilir; <strong>satirlar degistirilemez</strong> — teslim
          edilmis mal geriye donuk degistirilemez.
        </p>
      ) : null}

      <EditOrderForm
        orderId={id}
        linesLocked={deliveredAny}
        initial={{
          customer: {
            kind: 'existing',
            id: order.customerId,
            name: order.customerName,
            phone: order.customerPhone,
          },
          orderDate: order.orderDate,
          plannedDeliveryDate: order.plannedDeliveryDate ?? '',
          address: order.deliveryAddress,
          phone: order.deliveryPhone ?? '',
          phone2: order.deliveryPhone2 ?? '',
          deliveryNotes: order.deliveryNotes ?? '',
          discount: toTlInput(order.discountKurus),
          // toTlInput sifiri bos string yapiyor; elle yazilmis "0" toplam
          // bos gorunup otomatige donmesin diye burada dogrudan bicimliyoruz.
          manualTotal:
            order.manualTotalKurus == null
              ? ''
              : kurusToTl(order.manualTotalKurus).toFixed(2).replace('.', ','),
          invoice: {
            title: order.invoiceTitle ?? '',
            taxOffice: order.invoiceTaxOffice ?? '',
            taxNumber: order.invoiceTaxNumber ?? '',
            address: order.invoiceAddress ?? '',
            no: order.invoiceNo ?? '',
            date: order.invoiceDate ?? '',
          },
          notes: order.notes ?? '',
          lines: order.lines.map((line) => ({
            key: line.id,
            itemType: line.itemType,
            productId: line.productId,
            stockItemId: line.stockItemId,
            label: line.description,
            quantity: line.quantity,
            unitPrice: toTlInput(line.unitPriceKurus),
            isGift: line.isGift,
          })),
        }}
      />

      <Link href={`/siparisler/${id}`} className="inline-block text-sm text-neutral-500 hover:underline">
        Siparise don
      </Link>
    </div>
  );
}
