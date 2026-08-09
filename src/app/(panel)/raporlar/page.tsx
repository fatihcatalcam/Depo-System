import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/client';
import { getPeriodSummary, periodRange, type PeriodPreset } from '@/domain/reports';
import { formatDate, todayInIstanbul } from '@/lib/dates';
import { formatKurus } from '@/lib/money';
import { cn } from '@/lib/utils';

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: 'gun', label: 'Gunluk' },
  { value: 'hafta', label: 'Haftalik' },
  { value: 'ay', label: 'Aylik' },
];

interface PageProps {
  searchParams: Promise<{ donem?: string; tarih?: string }>;
}

export default async function RaporlarPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const preset: PeriodPreset = PRESETS.some((p) => p.value === params.donem)
    ? (params.donem as PeriodPreset)
    : 'ay';
  const reference = /^\d{4}-\d{2}-\d{2}$/.test(params.tarih ?? '')
    ? (params.tarih as string)
    : todayInIstanbul();

  const { from, to } = periodRange(preset, reference);
  const summary = await getPeriodSummary(db, from, to);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold">Raporlar</h1>
        <p className="text-sm text-neutral-500">
          {formatDate(from)} – {formatDate(to)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((option) => (
          <Link
            key={option.value}
            href={`/raporlar?donem=${option.value}&tarih=${reference}`}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs',
              preset === option.value
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500',
            )}
          >
            {option.label}
          </Link>
        ))}

        <form className="ml-auto flex gap-2">
          <input type="hidden" name="donem" value={preset} />
          <input
            type="date"
            name="tarih"
            defaultValue={reference}
            className="h-10 rounded-md border border-neutral-300 bg-white px-3 text-sm"
            aria-label="Referans tarih"
          />
          <button
            type="submit"
            className={cn(buttonVariants({ variant: 'outline' }), 'h-10 px-3')}
          >
            Goster
          </button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Siparis adedi" value={String(summary.orderCount)} />
        <Stat label="Ciro" value={formatKurus(summary.revenueKurus)} />
        <Stat label="Tahsilat" value={formatKurus(summary.collectedKurus)} />
        <Stat label="Teslimat adedi" value={String(summary.deliveryCount)} />
        <Stat
          label="Kalan alacak (guncel)"
          value={formatKurus(summary.outstandingKurus)}
          danger={summary.outstandingKurus > 0}
        />
        <Stat label="Stok degeri (guncel)" value={formatKurus(summary.stockValueKurus)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/raporlar/yazdir?donem=${preset}&tarih=${reference}`}
          className={cn(buttonVariants(), 'h-11 px-4')}
        >
          Yazdir / PDF
        </Link>
        <a
          href={`/api/disa-aktar/rapor?from=${from}&to=${to}`}
          className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4')}
        >
          Excel indir
        </a>
      </div>

      <section className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <h2 className="border-b border-neutral-200 p-3 text-sm font-semibold">
          En cok satan urunler
        </h2>
        {summary.topProducts.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-500">
            Bu donemde siparis kaydi yok.
          </p>
        ) : (
          <ul>
            {summary.topProducts.map((row) => (
              <li
                key={row.description}
                className="flex items-center justify-between gap-3 border-b border-neutral-100 p-3 text-sm last:border-0"
              >
                <span className="min-w-0 truncate">{row.description}</span>
                <span className="whitespace-nowrap tabular-nums">
                  <strong>{row.quantity}</strong> adet ·{' '}
                  <span className="text-neutral-600">{formatKurus(row.revenueKurus)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold tabular-nums ${
          danger ? 'text-red-600' : 'text-neutral-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
