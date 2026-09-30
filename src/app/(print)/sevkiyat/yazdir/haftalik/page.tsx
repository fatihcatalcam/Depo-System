import { PrintHeader } from '@/components/print-header';
import { ShipmentStopSheet } from '@/components/shipment-stop-sheet';
import { db } from '@/db/client';
import { getWeeklyShipment } from '@/domain/shipments';
import { currentScope } from '@/lib/auth/current';
import { formatLongDate, formatWeekday, todayInIstanbul } from '@/lib/dates';
import { formatKurus } from '@/lib/money';

interface PageProps {
  searchParams: Promise<{ hafta?: string }>;
}

/**
 * Haftalik sevkiyatin kagit hali: gun gun sofor kagitlari, fatura
 * bilgisiyle. Teslim edilmis duraklar da haftanin kaydi olarak basiliyor.
 */
export default async function HaftalikSevkiyatYazdirPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const anyDate = /^\d{4}-\d{2}-\d{2}$/.test(params.hafta ?? '')
    ? (params.hafta as string)
    : todayInIstanbul();

  const week = await getWeeklyShipment(db, await currentScope(), anyDate);

  return (
    <>
      <PrintHeader
        title="Haftalik Sevkiyat"
        subtitle={`${formatLongDate(week.weekStart)} – ${formatLongDate(week.weekEnd)}`}
      />

      <p className="mb-4 text-sm">
        {week.totalStops} durak · tahsil edilecek toplam{' '}
        <strong>{formatKurus(week.totalCollectionKurus)}</strong> (TL karsiligi)
      </p>

      {week.days.map((day) => (
        <section key={day.date} className="mb-2">
          <h2 className="mb-2 border-b-2 border-neutral-900 pb-0.5 text-sm font-bold uppercase">
            {formatWeekday(day.date)}
            <span className="ml-2 font-normal normal-case">
              {day.stops.length === 0 ? '— sevkiyat yok' : `· ${day.stops.length} durak`}
            </span>
          </h2>
          {day.stops.map((stop, index) => (
            <ShipmentStopSheet key={stop.orderId} stop={stop} index={index} showInvoice />
          ))}
        </section>
      ))}
    </>
  );
}
