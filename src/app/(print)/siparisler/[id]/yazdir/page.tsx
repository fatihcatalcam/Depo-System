import { notFound } from 'next/navigation';
import { PrintHeader } from '@/components/print-header';
import { db } from '@/db/client';
import { ORDER_STATUS_LABELS, getOrder } from '@/domain/orders/orders';
import { PAYMENT_METHOD_LABELS, listPayments } from '@/domain/orders/payments';
import { formatDate } from '@/lib/dates';
import { NotFoundError } from '@/lib/errors';
import { currentScope } from '@/lib/auth/current';
import { formatKurus } from '@/lib/money';

export default async function SiparisYazdirPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await currentScope();

  let order;
  try {
    order = await getOrder(db, scope, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const payments = await listPayments(db, scope, id);

  /**
   * Genel toplam elle yazildiysa satir fiyatlari anlamsizdir — cogu zaman
   * hepsi sifirdir. Musteriye giden kagitta bir sutun dolusu "0,00 TL"
   * basmaktansa sutunlari hic gostermiyoruz: kagitta ne geldigi ve tek bir
   * toplam kaliyor.
   */
  const showLinePrices = order.manualTotalKurus == null;

  return (
    <>
      <PrintHeader title="Siparis Formu" subtitle={order.orderNo} />

      <section className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase text-neutral-600">Musteri</div>
          <div>{order.customerName}</div>
          {order.customerPhone ? (
            <div className="text-xs text-neutral-600">{order.customerPhone}</div>
          ) : null}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-neutral-600">Teslimat adresi</div>
          <div>{order.deliveryAddress}</div>
          {order.deliveryPhone || order.deliveryPhone2 ? (
            <div className="text-xs text-neutral-600">
              Tel: {[order.deliveryPhone, order.deliveryPhone2].filter(Boolean).join(' · ')}
            </div>
          ) : null}
          {order.deliveryNotes ? (
            <div className="text-xs text-neutral-600">{order.deliveryNotes}</div>
          ) : null}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-neutral-600">Siparis tarihi</div>
          <div>{formatDate(order.orderDate)}</div>
          {order.salespersonName ? (
            <div className="text-xs text-neutral-600">Satici: {order.salespersonName}</div>
          ) : null}
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-neutral-600">
            Planlanan teslimat
          </div>
          <div>
            {formatDate(order.plannedDeliveryDate)} · {ORDER_STATUS_LABELS[order.status]}
          </div>
        </div>
      </section>

      {/* Fatura bilgisi cogu sipariste bos; girilmisse kagida da gecmeli. */}
      {order.invoiceTitle || order.invoiceNo ? (
        <section className="mb-4 border-t border-neutral-300 pt-2 text-sm">
          <div className="text-xs font-semibold uppercase text-neutral-600">Fatura bilgisi</div>
          <div>
            {order.invoiceTitle ?? '—'}
            {order.invoiceTaxNumber ? ` · ${order.invoiceTaxNumber}` : ''}
            {order.invoiceTaxOffice ? ` · ${order.invoiceTaxOffice}` : ''}
          </div>
          {order.invoiceAddress ? (
            <div className="text-xs text-neutral-600">{order.invoiceAddress}</div>
          ) : null}
          {order.invoiceNo ? (
            <div className="text-xs text-neutral-600">
              Fatura no {order.invoiceNo}
              {order.invoiceDate ? ` · ${formatDate(order.invoiceDate)}` : ''}
            </div>
          ) : null}
        </section>
      ) : null}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-400 text-left">
            <th className="py-1.5">Malzeme</th>
            <th className="w-16 py-1.5 text-right">Adet</th>
            {showLinePrices ? (
              <>
                <th className="w-28 py-1.5 text-right">Birim</th>
                <th className="w-28 py-1.5 text-right">Tutar</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <tr key={line.id} className="border-b border-neutral-200 align-top">
              <td className="py-2">
                <div className="font-medium">
                  {line.description}
                  {line.isGift ? <span className="ml-2 font-normal">(Hediye)</span> : null}
                </div>
                {line.components.length > 0 ? (
                  <ul className="mt-0.5 text-xs text-neutral-600">
                    {line.components.map((component) => (
                      <li key={component.id}>
                        · {component.quantityPerUnit} × {component.stockItemName}
                        {component.sizeLabel ? ` · ${component.sizeLabel}` : ''}
                        {component.variantLabel ? ` · ${component.variantLabel}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </td>
              <td className="py-2 text-right tabular-nums">{line.quantity}</td>
              {showLinePrices ? (
                <>
                  {/* Musteriye giden kagitta "0,00 TL" degil "Hediye" yaziyor. */}
                  <td className="py-2 text-right tabular-nums">
                    {line.isGift ? '—' : formatKurus(line.unitPriceKurus, { currency: order.currency })}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {line.isGift ? 'Hediye' : formatKurus(line.lineTotalKurus, { currency: order.currency })}
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-3 flex justify-end">
        <dl className="w-64 space-y-1 text-sm">
          {/* Toplam elle yazilmissa satir toplamini basmiyoruz: musterinin
              eline iki farkli rakam gecmesin. */}
          {showLinePrices ? (
            <>
              <div className="flex justify-between">
                <dt>Ara toplam</dt>
                <dd className="tabular-nums">{formatKurus(order.subtotalKurus, { currency: order.currency })}</dd>
              </div>
              {order.discountKurus > 0 ? (
                <div className="flex justify-between">
                  <dt>Iskonto</dt>
                  <dd className="tabular-nums">-{formatKurus(order.discountKurus, { currency: order.currency })}</dd>
                </div>
              ) : null}
            </>
          ) : null}
          <div className="flex justify-between border-t border-neutral-400 pt-1 font-bold">
            <dt>Genel toplam</dt>
            <dd className="tabular-nums">{formatKurus(order.totalKurus, { currency: order.currency })}</dd>
          </div>
          {order.depositKurus > 0 ? (
            <div className="flex justify-between">
              <dt>Alinan ucret (kapora)</dt>
              <dd className="tabular-nums">{formatKurus(order.depositKurus, { currency: order.currency })}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt>Odenen</dt>
            <dd className="tabular-nums">{formatKurus(order.paidKurus, { currency: order.currency })}</dd>
          </div>
          <div className="flex justify-between border-t border-neutral-300 pt-1 text-base font-bold">
            <dt>Kalan</dt>
            <dd className="tabular-nums">{formatKurus(order.balanceKurus, { currency: order.currency })}</dd>
          </div>
        </dl>
      </div>

      {payments.length > 0 ? (
        <section className="mt-5">
          <h2 className="mb-1 text-xs font-semibold uppercase text-neutral-600">Odemeler</h2>
          <ul className="text-sm">
            {payments.map((payment) => (
              <li key={payment.id} className="flex justify-between border-b border-neutral-200 py-1">
                <span>
                  {formatDate(payment.paidAt)} · {PAYMENT_METHOD_LABELS[payment.method]}
                  {payment.notes ? ` · ${payment.notes}` : ''}
                </span>
                <span className="tabular-nums">{formatKurus(payment.amountKurus, { currency: order.currency })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {order.notes ? (
        <p className="mt-4 text-sm">
          <span className="font-semibold">Not: </span>
          {order.notes}
        </p>
      ) : null}

      <div className="mt-10 flex justify-between text-xs">
        <div className="w-48">
          Teslim eden
          <div className="mt-6 border-b border-neutral-400" />
        </div>
        <div className="w-48">
          Teslim alan
          <div className="mt-6 border-b border-neutral-400" />
        </div>
      </div>
    </>
  );
}
