import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { getRates } from '@/domain/exchange-rates';
import { ORDER_STATUS_LABELS, getOrder } from '@/domain/orders/orders';
import { listPayments } from '@/domain/orders/payments';
import { listSalespeople } from '@/domain/parties/salespeople';
import { currentScope } from '@/lib/auth/current';
import { NotFoundError } from '@/lib/errors';
import { formatRate, kurusToTl, type Currency } from '@/lib/money';
import type { RateOption } from '../../order-form';
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

  // Isten ayrilan saticinin eski siparisi acildiginda adi listede kalmali;
  // yoksa select bos gorunur ve kaydedince satici sessizce silinirdi.
  const [payments, rates] = await Promise.all([listPayments(db, scope, id), getRates(db)]);

  const salespeople = (await listSalespeople(db, { includeInactive: true }))
    .filter((person) => person.isActive || person.id === order.salespersonId)
    .map((person) => ({ id: person.id, name: person.name }));

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
        salespeople={salespeople}
        rates={toRateOptions(rates)}
        initial={{
          customer: {
            kind: 'existing',
            id: order.customerId,
            name: order.customerName,
            phone: order.customerPhone,
          },
          salespersonId: order.salespersonId ?? '',
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
          currency: order.currency,
          // TL'de kur alani gizli; doviz sipariste mevcut kur hazir gelsin.
          exchangeRate: order.currency === 'TRY' ? '' : formatRate(order.exchangeRate),
          // Para birimi yalnizca taslak ve tahsilatsiz sipariste degisebilir:
          // alinmis para baska bir birimdeyse o tahsilat anlamsizlasirdi.
          currencyLocked: order.status !== 'draft' || payments.length > 0,
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

/** Kuru forma metin olarak veriyoruz: kullanici uzerine yazabilsin diye. */
function toRateOptions(
  rates: Awaited<ReturnType<typeof getRates>>,
): Partial<Record<Currency, RateOption>> {
  const result: Partial<Record<Currency, RateOption>> = {};
  for (const [code, info] of Object.entries(rates)) {
    if (!info) continue;
    result[code as Currency] = {
      rate: formatRate(info.rate),
      date: info.date,
      stale: info.stale,
    };
  }
  return result;
}
