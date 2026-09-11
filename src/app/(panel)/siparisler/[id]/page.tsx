import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/client';
import { listDeliveriesForOrder } from '@/domain/orders/deliveries';
import { ORDER_STATUS_LABELS, getOrder } from '@/domain/orders/orders';
import { listPayments } from '@/domain/orders/payments';
import { currentScope } from '@/lib/auth/current';
import { NotFoundError } from '@/lib/errors';
import { formatKurus } from '@/lib/money';
import { cn } from '@/lib/utils';
import { DeliveryForm } from './delivery-form';
import { DeliveryPlan } from './delivery-plan';
import { OrderActions } from './order-actions';
import { PaymentPanel } from './payment-panel';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeZone: 'Europe/Istanbul',
});
const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

function formatDate(value: string | null) {
  if (!value) return '—';
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export default async function SiparisDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const scope = await currentScope();

  let order;
  try {
    order = await getOrder(db, scope, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [deliveries, payments] = await Promise.all([
    listDeliveriesForOrder(db, scope, id),
    listPayments(db, scope, id),
  ]);

  const isDraft = order.status === 'draft';
  const canDeliver = order.status === 'confirmed' || order.status === 'partially_delivered';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{order.orderNo}</h1>
          <p className="text-sm text-neutral-500">
            {order.customerName}
            {order.customerPhone ? ` · ${order.customerPhone}` : ''} ·{' '}
            {ORDER_STATUS_LABELS[order.status]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {order.status === 'draft' ||
          order.status === 'confirmed' ||
          order.status === 'partially_delivered' ? (
            <Link
              href={`/siparisler/${order.id}/duzenle`}
              className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4')}
            >
              Duzenle
            </Link>
          ) : null}
          <OrderActions orderId={order.id} status={order.status} />
        </div>
      </div>

      <section className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase text-neutral-500">Teslimat adresi</dt>
            <dd>{order.deliveryAddress}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-neutral-500">Telefon</dt>
            <dd>{order.deliveryPhone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-neutral-500">Siparis tarihi</dt>
            <dd>{formatDate(order.orderDate)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase text-neutral-500">Planlanan teslimat</dt>
            <dd>{formatDate(order.plannedDeliveryDate)}</dd>
          </div>
          {order.deliveryNotes ? (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase text-neutral-500">Teslimat notu</dt>
              <dd>{order.deliveryNotes}</dd>
            </div>
          ) : null}
          {order.notes ? (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase text-neutral-500">Siparis notu</dt>
              <dd>{order.notes}</dd>
            </div>
          ) : null}
          {/* Fatura bilgisi cogu sipariste bos; doluysa gosteriliyor. */}
          {order.invoiceTitle || order.invoiceNo ? (
            <div className="sm:col-span-2 border-t border-neutral-100 pt-2">
              <dt className="text-xs uppercase text-neutral-500">Fatura</dt>
              <dd>
                {order.invoiceTitle ?? '—'}
                {order.invoiceTaxNumber ? ` · ${order.invoiceTaxNumber}` : ''}
                {order.invoiceTaxOffice ? ` · ${order.invoiceTaxOffice}` : ''}
              </dd>
              {order.invoiceAddress ? (
                <dd className="text-neutral-600">{order.invoiceAddress}</dd>
              ) : null}
              {order.invoiceNo ? (
                <dd className="text-neutral-600">
                  Fatura no {order.invoiceNo}
                  {order.invoiceDate ? ` · ${formatDate(order.invoiceDate)}` : ''}
                </dd>
              ) : null}
            </div>
          ) : null}
        </dl>

        {order.status !== 'cancelled' && order.status !== 'delivered' ? (
          <DeliveryPlan
            orderId={order.id}
            plannedDeliveryDate={order.plannedDeliveryDate}
            deliveryAddress={order.deliveryAddress}
            deliveryPhone={order.deliveryPhone}
            deliveryPhone2={order.deliveryPhone2}
            deliveryNotes={order.deliveryNotes}
          />
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <h2 className="border-b border-neutral-200 p-3 text-sm font-semibold">Malzemeler</h2>
            <ul>
              {order.lines.map((line) => (
                <li key={line.id} className="border-b border-neutral-100 p-3 last:border-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">
                      {line.quantity} × {line.description}
                      {line.isGift ? (
                        <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">
                          Hediye
                        </span>
                      ) : null}
                    </span>
                    <span className="text-sm tabular-nums">
                      {formatKurus(line.lineTotalKurus)}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-400">
                    {line.isGift
                      ? `hediye · degeri ${formatKurus(line.unitPriceKurus * line.quantity)}`
                      : `birim ${formatKurus(line.unitPriceKurus)}`}
                  </div>

                  {line.components.length > 0 ? (
                    <ul className="mt-2 space-y-1 border-l-2 border-neutral-100 pl-3">
                      {line.components.map((component) => {
                        const short = component.availableQuantity < component.remainingQuantity;
                        return (
                          <li
                            key={component.id}
                            className="flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <span className="text-neutral-600">
                              {component.stockItemName}
                              {component.sizeLabel ? ` · ${component.sizeLabel}` : ''}
                              {component.variantLabel ? ` · ${component.variantLabel}` : ''}
                            </span>
                            <span className="tabular-nums">
                              <span className="text-neutral-500">
                                {component.deliveredQuantity}/{component.totalQuantity} teslim
                              </span>
                              {short ? (
                                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                                  serbest stok {component.availableQuantity}
                                </span>
                              ) : null}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-xs text-neutral-400">
                      Malzeme dokumu siparis onaylandiginda dondurulur.
                    </p>
                  )}
                </li>
              ))}
            </ul>

            <div className="space-y-1 border-t border-neutral-200 bg-neutral-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-600">Ara toplam</span>
                <span className="tabular-nums">{formatKurus(order.subtotalKurus)}</span>
              </div>
              {order.discountKurus > 0 ? (
                <div className="flex justify-between">
                  <span className="text-neutral-600">Iskonto</span>
                  <span className="tabular-nums">-{formatKurus(order.discountKurus)}</span>
                </div>
              ) : null}
              <div className="flex justify-between font-semibold">
                <span>
                  Genel toplam
                  {/* Satir toplamiyla uyusmamasi hata degil; sebebini
                      yazmazsak oyle gorunur. */}
                  {order.manualTotalKurus != null ? (
                    <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-normal text-neutral-700">
                      elle yazildi
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums">{formatKurus(order.totalKurus)}</span>
              </div>
            </div>
          </section>

          {canDeliver ? <DeliveryForm orderId={order.id} lines={order.lines} /> : null}

          {deliveries.length > 0 ? (
            <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
              <h2 className="border-b border-neutral-200 p-3 text-sm font-semibold">
                Teslimat gecmisi
              </h2>
              <ul>
                {deliveries.map((delivery) => (
                  <li key={delivery.id} className="border-b border-neutral-100 p-3 last:border-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{delivery.deliveryNo}</span>
                      <span className="text-xs text-neutral-500">
                        {dateTimeFormatter.format(delivery.deliveredAt)}
                      </span>
                    </div>
                    {delivery.deliveredBy || delivery.receiverName ? (
                      <p className="text-xs text-neutral-500">
                        {delivery.deliveredBy ? `Teslim eden: ${delivery.deliveredBy}` : ''}
                        {delivery.deliveredBy && delivery.receiverName ? ' · ' : ''}
                        {delivery.receiverName ? `Teslim alan: ${delivery.receiverName}` : ''}
                      </p>
                    ) : null}
                    <ul className="mt-1 space-y-0.5">
                      {delivery.lines.map((line) => (
                        <li key={line.id} className="text-xs text-neutral-600">
                          {line.quantity} × {line.stockItemName}
                          {line.sizeLabel ? ` · ${line.sizeLabel}` : ''}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <PaymentPanel
          orderId={order.id}
          totalKurus={order.totalKurus}
          paidKurus={order.paidKurus}
          depositKurus={order.depositKurus}
          balanceKurus={order.balanceKurus}
          payments={payments}
          canAddPayment={order.status !== 'cancelled'}
          // Taslak sipariste yalnizca kapora alinabilir: musteri parayi
          // siparisi verirken birakiyor, siparis henuz onaylanmamis oluyor.
          depositOnly={isDraft}
        />
      </div>

      <Link href="/siparisler" className={cn('inline-block text-sm text-neutral-500 hover:underline')}>
        Siparis listesine don
      </Link>
    </div>
  );
}
