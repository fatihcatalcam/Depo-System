import { PrintHeader } from '@/components/print-header';
import { ShipmentStopSheet } from '@/components/shipment-stop-sheet';
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
            <strong>{formatKurus(shipment.totalCollectionKurus)}</strong> (TL karsiligi)
          </p>

          {shipment.stops.map((stop, index) => (
            <ShipmentStopSheet key={stop.orderId} stop={stop} index={index} />
          ))}
        </>
      )}
    </>
  );
}
