import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/client';
import { getDailyShipment } from '@/domain/shipments';
import { formatLongDate, todayInIstanbul } from '@/lib/dates';
import { currentUser } from '@/lib/auth/current';
import { formatKurus } from '@/lib/money';
import { cn } from '@/lib/utils';
import { DatePicker } from './date-picker';
import { DeliverStopButton } from './deliver-stop-button';

interface PageProps {
  searchParams: Promise<{ tarih?: string }>;
}

export default async function SevkiyatPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.tarih ?? '')
    ? (params.tarih as string)
    : todayInIstanbul();

  const user = await currentUser();
  const shipment = await getDailyShipment(db, user.scope, date);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Gunluk sevkiyat</h1>
        <p className="text-sm text-neutral-500">
          {formatLongDate(date)}
          {/* Merkez iki subenin sevkiyatini birlikte goruyor; kagit
              ciktisini yanlis subeye vermemesi icin acikca yaziyoruz. */}
          {user.isCentral ? ' · iki sube birlikte' : ` · ${user.label}`}
        </p>
      </div>

      <DatePicker date={date} />

      {shipment.stops.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          Bu tarihe planlanmis sevkiyat yok. Siparislere teslimat tarihi girildiginde burada
          gorunur.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Durak" value={String(shipment.stops.length)} />
            <Stat label="Toplam parca" value={String(shipment.totalPieces)} />
            <Stat
              label="Tahsil edilecek"
              value={formatKurus(shipment.totalCollectionKurus)}
              danger={shipment.totalCollectionKurus > 0}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/sevkiyat/yazdir/toplama?tarih=${date}`}
              className={cn(buttonVariants(), 'h-11 px-4')}
            >
              Depo toplama listesi
            </Link>
            <Link
              href={`/sevkiyat/yazdir/sofor?tarih=${date}`}
              className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4')}
            >
              Sofor sevkiyat kagidi
            </Link>
          </div>

          <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
            <h2 className="border-b border-neutral-200 p-3 text-sm font-semibold">
              Toplanacak parcalar
            </h2>
            <ul>
              {shipment.pickingList.map((item) => (
                <li
                  key={item.stockItemId}
                  className="flex items-center justify-between gap-3 border-b border-neutral-100 p-3 text-sm last:border-0"
                >
                  <span className="min-w-0">
                    {item.stockItemName}
                    {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
                    {item.variantLabel ? ` · ${item.variantLabel}` : ''}
                    <span className="ml-2 text-xs text-neutral-400">{item.stockItemSku}</span>
                  </span>
                  <span className="text-base font-semibold tabular-nums">{item.quantity}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Duraklar</h2>
            {shipment.stops.map((stop, index) => (
              <div key={stop.orderId} className="rounded-lg border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {index + 1}. {stop.customerName}
                    <Link
                      href={`/siparisler/${stop.orderId}`}
                      className="ml-2 text-xs font-normal text-neutral-500 hover:underline"
                    >
                      {stop.orderNo}
                    </Link>
                  </span>
                  {/* Merkez baska subenin duragini da teslim edebilir; mal o
                      subenin deposundan duser. */}
                  <DeliverStopButton
                    orderId={stop.orderId}
                    customerName={stop.customerName}
                    pieces={stop.items.reduce((sum, item) => sum + item.quantity, 0)}
                  />
                </div>
                <p className="text-sm text-neutral-600">{stop.deliveryAddress}</p>
                <p className="text-sm font-semibold tabular-nums text-neutral-800">
                  {[
                    stop.deliveryPhone ?? stop.customerPhone,
                    stop.deliveryPhone2 ?? stop.customerPhone2,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'telefon yok'}
                </p>
                {stop.deliveryNotes ? (
                  <p className="text-xs text-neutral-500">{stop.deliveryNotes}</p>
                ) : null}

                <ul className="mt-2 space-y-0.5">
                  {stop.items.map((item) => (
                    <li key={item.stockItemId} className="text-sm">
                      {item.quantity} × {item.stockItemName}
                      {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
                    </li>
                  ))}
                </ul>

                {stop.balanceKurus > 0 ? (
                  <p className="mt-2 text-sm font-semibold text-red-600">
                    Tahsil edilecek: {formatKurus(stop.balanceKurus)}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-green-700">Odemesi tamamlanmis</p>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          danger ? 'text-red-600' : 'text-neutral-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
