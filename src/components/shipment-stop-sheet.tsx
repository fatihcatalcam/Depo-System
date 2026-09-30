import { PlaceLine } from '@/components/place-line';
import type { ShipmentStop } from '@/domain/shipments';
import { formatDate } from '@/lib/dates';
import { formatKurus } from '@/lib/money';

interface Props {
  stop: ShipmentStop;
  index: number;
  /** Haftalik ozette fatura bilgisi de basiliyor. */
  showInvoice?: boolean;
  /** Imza alani yalnizca kagitta anlamli; ekranda bos yer. */
  signature?: boolean;
}

/**
 * Sofor kagidindaki bir durak: musteri, ilce ve adres, telefonlar, inecek
 * malzeme, tahsil edilecek tutar ve imza alani. Gunluk sofor kagidi ve
 * haftalik ozet ayni bileseni kullaniyor, iki kagit birbirinden ayrismasin.
 */
export function ShipmentStopSheet({
  stop,
  index,
  showInvoice = false,
  signature = true,
}: Props) {
  const delivered = stop.status === 'delivered';

  return (
    <section className="mb-4 break-inside-avoid border border-neutral-400 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-neutral-300 pb-1.5">
        <span className="text-sm font-bold">
          {index + 1}. {stop.customerName}
        </span>
        <span className="text-xs text-neutral-600">
          {delivered ? (
            <strong className="mr-2 border border-neutral-700 px-1 uppercase">Teslim edildi</strong>
          ) : null}
          {stop.orderNo}
        </span>
      </div>

      <div className="grid gap-1 py-2 text-sm sm:grid-cols-[1fr_auto]">
        <div>
          {/* Ilce once ve buyuk: sofor rotayi ilceye gore kuruyor. */}
          <PlaceLine
            district={stop.deliveryDistrict}
            city={stop.deliveryCity}
            country={stop.deliveryCountry}
            print
          />
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
          <div className="text-xs uppercase text-neutral-600">
            {delivered ? 'Kalan' : 'Tahsil edilecek'}
          </div>
          <div className="text-lg font-bold tabular-nums">
            {stop.balanceKurus > 0
              ? formatKurus(stop.balanceKurus, { currency: stop.currency })
              : 'Odendi'}
          </div>
        </div>
      </div>

      <table className="w-full border-collapse text-sm">
        <tbody>
          {stop.items.map((item, itemIndex) => (
            // Serbest satirin stok karti yok; kimligi bos olabilir.
            <tr
              key={`${item.stockItemId ?? item.stockItemName}-${itemIndex}`}
              className="border-t border-neutral-200"
            >
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

      {showInvoice ? <InvoiceBlock stop={stop} /> : null}

      {/* Teslim edilmis durakta imza alani bos yer kaplar. */}
      {delivered || !signature ? null : (
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
      )}
    </section>
  );
}

function InvoiceBlock({ stop }: { stop: ShipmentStop }) {
  const { invoice } = stop;
  const hasInvoice = Object.values(invoice).some(Boolean);
  if (!hasInvoice) {
    return <div className="mt-2 text-xs text-neutral-600">Fatura: yok</div>;
  }

  // Fatura adresi teslimat adresiyle aynıysa tekrar basmak kagidi uzatir.
  const invoiceAddress =
    invoice.address && invoice.address.trim() !== stop.deliveryAddress.trim()
      ? invoice.address
      : null;

  return (
    <div className="mt-2 border-t border-neutral-300 pt-1.5 text-xs">
      <span className="font-semibold uppercase">Fatura: </span>
      {[
        invoice.title,
        invoice.taxOffice ? `VD ${invoice.taxOffice}` : null,
        invoice.taxNumber ? `VKN/TCKN ${invoice.taxNumber}` : null,
        invoice.no ? `No ${invoice.no}` : null,
        invoice.date ? formatDate(invoice.date) : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      {invoiceAddress ? <div>Fatura adresi: {invoiceAddress}</div> : null}
    </div>
  );
}
