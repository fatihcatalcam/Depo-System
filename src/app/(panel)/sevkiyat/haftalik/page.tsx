import Link from 'next/link';
import { ShipmentStopSheet } from '@/components/shipment-stop-sheet';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/client';
import { getWeeklyShipment } from '@/domain/shipments';
import { currentUser } from '@/lib/auth/current';
import { addDays, formatLongDate, formatWeekday, todayInIstanbul } from '@/lib/dates';
import { formatKurus } from '@/lib/money';
import { cn } from '@/lib/utils';

interface PageProps {
  searchParams: Promise<{ hafta?: string }>;
}

/**
 * Haftalik sevkiyat ozeti: pazartesiden pazara butun duraklar, sofor
 * kagitlari gibi, tek sayfada. Her durakta fatura bilgisi de var.
 */
export default async function HaftalikSevkiyatPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const anyDate = /^\d{4}-\d{2}-\d{2}$/.test(params.hafta ?? '')
    ? (params.hafta as string)
    : todayInIstanbul();

  const user = await currentUser();
  const week = await getWeeklyShipment(db, user.scope, anyDate);
  const weekLink = (date: string) => `/sevkiyat/haftalik?hafta=${date}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Haftalik sevkiyat</h1>
          <p className="text-sm text-neutral-500">
            {formatLongDate(week.weekStart)} – {formatLongDate(week.weekEnd)}
            {user.isCentral ? ' · iki sube birlikte' : ` · ${user.label}`}
          </p>
        </div>
        <Link
          href={`/sevkiyat/yazdir/haftalik?hafta=${week.weekStart}`}
          className={cn(buttonVariants(), 'h-11 px-4')}
        >
          Yazdir
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2">
        <Link
          href={weekLink(addDays(week.weekStart, -7))}
          className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-3')}
        >
          ← Onceki hafta
        </Link>
        <Link
          href={weekLink(todayInIstanbul())}
          className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-3')}
        >
          Bu hafta
        </Link>
        <Link
          href={weekLink(addDays(week.weekStart, 7))}
          className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-3')}
        >
          Sonraki hafta →
        </Link>
      </nav>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Durak" value={String(week.totalStops)} />
        <Stat
          label="Tahsil edilecek (TL karsiligi)"
          value={formatKurus(week.totalCollectionKurus)}
          danger={week.totalCollectionKurus > 0}
        />
      </div>

      {week.days.map((day) => (
        <section key={day.date} className="space-y-2">
          <h2 className="flex items-baseline justify-between border-b border-neutral-300 pb-1 text-base font-bold">
            <Link href={`/sevkiyat?tarih=${day.date}`} className="hover:underline">
              {formatWeekday(day.date)}
            </Link>
            <span className="text-sm font-normal text-neutral-500">
              {day.stops.length === 0 ? 'sevkiyat yok' : `${day.stops.length} durak`}
            </span>
          </h2>
          {day.stops.map((stop, index) => (
            <div key={stop.orderId} className="bg-white">
              <ShipmentStopSheet stop={stop} index={index} showInvoice signature={false} />
            </div>
          ))}
        </section>
      ))}
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
