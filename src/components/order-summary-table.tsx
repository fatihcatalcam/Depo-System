import { FactoryTick } from '@/components/factory-tick';
import { PlannedDateCell } from '@/components/planned-date-cell';
import { RowLink } from '@/components/row-link';
import type { OrderSummaryRow, SummaryItem } from '@/domain/orders/summary';
import { formatDate, todayInIstanbul } from '@/lib/dates';
import { formatKurus, toTryKurus } from '@/lib/money';
import { formatPaymentMethod } from '@/lib/payment-methods';
import { formatPlace } from '@/lib/places';
import { cn } from '@/lib/utils';

interface Props {
  rows: OrderSummaryRow[];
  /** Ekranda satira tiklayinca siparis acilir; kagitta anlami yok. */
  linkRows?: boolean;
  /** Kagit: daha kucuk punto, siyah cizgiler. */
  print?: boolean;
}

/**
 * Dukkanin Excel'deki siparis listesi: sira, musteri ve telefonlari,
 * siparisin cinsi, teslim tarihi, ilce — Excel'de olmayan odeme bilgisiyle
 * birlikte: toplam, alinan (yontem ve taksit kirilimiyla), kalan.
 */
export function OrderSummaryTable({ rows, linkRows = false, print = false }: Props) {
  const today = todayInIstanbul();
  // Farkli para birimlerindeki tutarlar ancak TL karsiligiyla toplanir.
  const totals = rows.reduce(
    (sum, row) => ({
      total: sum.total + toTryKurus(row.totalKurus, row.exchangeRate),
      paid: sum.paid + toTryKurus(row.paidKurus, row.exchangeRate),
      balance: sum.balance + Math.max(0, toTryKurus(row.balanceKurus, row.exchangeRate)),
    }),
    { total: 0, paid: 0, balance: 0 },
  );

  const cell = print ? 'border border-neutral-500 px-1.5 py-1 align-top' : 'p-2.5 align-top';

  return (
    <table
      className={cn(
        'w-full border-collapse',
        print ? 'text-[10px] leading-snug' : 'min-w-[1100px] text-sm',
      )}
    >
      <thead
        className={cn(
          'text-left text-xs font-semibold uppercase',
          print ? 'bg-neutral-100' : 'border-b border-neutral-200 bg-amber-100/60 text-neutral-700',
        )}
      >
        <tr>
          <th className={cn(cell, 'w-8 text-center')}>No</th>
          <th className={cell}>Müşteri</th>
          <th className={cell}>Sipariş</th>
          <th className={cn(cell, 'w-[26%]')}>Siparişin cinsi</th>
          <th className={cell}>Teslim</th>
          <th className={cell}>İlçe</th>
          <th className={cn(cell, 'text-right')}>Toplam</th>
          <th className={cn(cell, 'text-right')}>Alınan</th>
          <th className={cn(cell, 'text-right')}>Kalan</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          // Gecikme yalnizca teslim edilmemis sipariste anlamli; gunluk
          // gorunumde teslim edilmisler de listede.
          const overdue =
            row.status !== 'delivered' &&
            row.plannedDeliveryDate !== null &&
            row.plannedDeliveryDate < today;
          const cells = (
            <>
              <td className={cn(cell, 'text-center tabular-nums text-neutral-500')}>{index + 1}</td>
              <td className={cell}>
                <div className="font-bold uppercase">{row.customerName}</div>
                {row.phones.map((phone) => (
                  <div key={phone} className="tabular-nums">
                    {phone}
                  </div>
                ))}
              </td>
              <td className={cn(cell, 'whitespace-nowrap')}>
                <div className="flex items-center gap-1.5 font-semibold">
                  <FactoryTick
                    orderId={row.id}
                    ordered={row.factoryOrderedAt !== null}
                    readOnly={print || row.status === 'cancelled'}
                  />
                  {row.orderNo}
                </div>
                <div className="text-neutral-500">{formatDate(row.orderDate)}</div>
              </td>
              <td className={cell}>
                <ItemsCell items={row.items} />
              </td>
              <td
                className={cn(
                  cell,
                  'whitespace-nowrap font-bold tabular-nums',
                  // Excel'deki kirmizi tarihler: gunu gecmis, hala teslim edilmemis.
                  overdue && 'text-red-600',
                )}
              >
                {/* Ekranda teslim edilmemis sipariste tarih tiklanip degistirilir. */}
                {!print && row.status !== 'delivered' && row.status !== 'cancelled' ? (
                  <PlannedDateCell
                    orderId={row.id}
                    date={row.plannedDeliveryDate}
                    overdue={overdue}
                  />
                ) : (
                  formatDate(row.plannedDeliveryDate)
                )}
              </td>
              <td className={cn(cell, 'font-semibold uppercase')}>
                {formatPlace({
                  district: row.deliveryDistrict,
                  // Istanbul her satirda tekrar etmesin; baska ilse yazilir.
                  city: row.deliveryCity === 'İstanbul' ? null : row.deliveryCity,
                  country: row.deliveryCountry,
                }) || '—'}
              </td>
              <td className={cn(cell, 'whitespace-nowrap text-right tabular-nums')}>
                {formatKurus(row.totalKurus, { currency: row.currency })}
              </td>
              <td className={cn(cell, 'text-right tabular-nums')}>
                <div className="whitespace-nowrap font-semibold">
                  {row.paidKurus > 0 ? formatKurus(row.paidKurus, { currency: row.currency }) : '—'}
                </div>
                {row.paymentBreakdown.map((entry) => (
                  <div
                    key={`${entry.method}-${entry.installments ?? 1}`}
                    className="whitespace-nowrap text-neutral-600"
                  >
                    {formatPaymentMethod(entry.method, entry.installments)}{' '}
                    {formatKurus(entry.amountKurus, { currency: row.currency })}
                  </div>
                ))}
              </td>
              <td
                className={cn(
                  cell,
                  'whitespace-nowrap text-right font-bold tabular-nums',
                  row.balanceKurus > 0 ? 'text-red-600' : 'text-neutral-500',
                )}
              >
                {formatKurus(row.balanceKurus, { currency: row.currency })}
              </td>
            </>
          );

          return linkRows ? (
            <RowLink key={row.id} href={`/siparisler/${row.id}`}>
              {cells}
            </RowLink>
          ) : (
            <tr key={row.id} className="break-inside-avoid border-b border-neutral-100">
              {cells}
            </tr>
          );
        })}
      </tbody>
      <tfoot className={cn('font-bold', print ? 'bg-neutral-100' : 'border-t-2 border-neutral-300')}>
        <tr>
          <td className={cell} colSpan={6}>
            {rows.length} sipariş · toplamlar TL karşılığı
          </td>
          <td className={cn(cell, 'whitespace-nowrap text-right tabular-nums')}>
            {formatKurus(totals.total)}
          </td>
          <td className={cn(cell, 'whitespace-nowrap text-right tabular-nums')}>
            {formatKurus(totals.paid)}
          </td>
          <td className={cn(cell, 'whitespace-nowrap text-right tabular-nums text-red-600')}>
            {formatKurus(totals.balance)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Teslim edilmeyen mavi, edilen kirmizi (dukkanin tercihi); urunler arasinda "+". */
function ItemsCell({ items }: { items: SummaryItem[] }) {
  if (items.length === 0) return <>—</>;
  const tone = (delivered: boolean) => (delivered ? 'text-red-600' : 'text-blue-700');
  return (
    <>
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 ? <span className="text-neutral-400"> + </span> : null}
          {item.parts ? (
            <>
              <span>{item.text}: </span>
              {item.parts.map((part, partIndex) => (
                <span key={partIndex} className={cn('font-medium', tone(part.delivered))}>
                  {partIndex > 0 ? ', ' : ''}
                  {part.label}
                </span>
              ))}
            </>
          ) : (
            <span className={cn('font-medium', tone(item.delivered))}>{item.text}</span>
          )}
        </span>
      ))}
    </>
  );
}
