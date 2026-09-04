import { PrintHeader } from '@/components/print-header';
import { db } from '@/db/client';
import { getDailyShipment } from '@/domain/shipments';
import { formatLongDate, todayInIstanbul } from '@/lib/dates';
import { currentScope } from '@/lib/auth/current';
import { formatKurus } from '@/lib/money';

interface PageProps {
  searchParams: Promise<{ tarih?: string }>;
}

/**
 * Sofor sevkiyat kagidi: her durak icin musteri, adres, telefon, inecek
 * malzeme, tahsil edilecek tutar ve imza alani.
 */
export default async function SoforKagidiPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.tarih ?? '')
    ? (params.tarih as string)
    : todayInIstanbul();

  const shipment = await getDailyShipment(db, await currentScope(), date);

  return (
    <>
      <PrintHeader title="Sevkiyat Kagidi" subtitle={formatLongDate(date)} />

      {shipment.stops.length === 0 ? (
        <p className="text-sm">Bu tarihe planlanmis sevkiyat yok.</p>
      ) : (
        <>
          <p className="mb-4 text-sm">
            {shipment.stops.length} durak · {shipment.totalPieces} parca · tahsil edilecek toplam{' '}
            <strong>{formatKurus(shipment.totalCollectionKurus)}</strong>
          </p>

          {shipment.stops.map((stop, index) => (
            <section
              key={stop.orderId}
              className="mb-4 break-inside-avoid border border-neutral-400 p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-300 pb-1.5">
                <span className="text-sm font-bold">
                  {index + 1}. {stop.customerName}
                </span>
                <span className="text-xs text-neutral-600">{stop.orderNo}</span>
              </div>

              <div className="grid gap-1 py-2 text-sm sm:grid-cols-[1fr_auto]">
                <div>
                  <div>{stop.deliveryAddress}</div>

                  {/* Telefon sofor icin bu kagittaki en islevsel bilgi: arac
                      sokakta, adres bulunamadiginda aranan numara bu. Kucuk ve
                      gri basmak, tam ihtiyac aninda okunamamasi demek. */}
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    {[
                      stop.deliveryPhone ?? stop.customerPhone,
                      stop.deliveryPhone2 ?? stop.customerPhone2,
                    ]
                      .filter((phone): phone is string => Boolean(phone))
                      .map((phone) => (
                        <span key={phone} className="text-lg font-bold tabular-nums">
                          {phone}
                        </span>
                      ))}
                    {!stop.deliveryPhone && !stop.customerPhone ? (
                      <span className="text-sm text-neutral-600">Telefon yok</span>
                    ) : null}
                  </div>

                  {stop.deliveryNotes ? (
                    <div className="mt-0.5 text-xs font-medium">Not: {stop.deliveryNotes}</div>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase text-neutral-600">Tahsil edilecek</div>
                  <div className="text-lg font-bold tabular-nums">
                    {stop.balanceKurus > 0 ? formatKurus(stop.balanceKurus) : 'Odendi'}
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse text-sm">
                <tbody>
                  {stop.items.map((item) => (
                    <tr key={item.stockItemId} className="border-t border-neutral-200">
                      <td className="w-8 py-1">
                        <span className="inline-block h-3.5 w-3.5 border border-neutral-500" />
                      </td>
                      <td className="py-1">
                        {item.stockItemName}
                        {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
                        {item.variantLabel ? ` · ${item.variantLabel}` : ''}
                      </td>
                      <td className="w-16 py-1 text-right font-bold tabular-nums">
                        {item.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-3 flex justify-between gap-4 text-xs">
                <div className="flex-1">
                  Teslim alan (ad soyad / imza):
                  <div className="mt-4 border-b border-neutral-400" />
                </div>
                <div className="w-28">
                  Alinan tutar:
                  <div className="mt-4 border-b border-neutral-400" />
                </div>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
