import Link from 'next/link';
import { Suspense } from 'react';
import { OrderSummaryTable } from '@/components/order-summary-table';
import { SearchBox } from '@/components/search-box';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/client';
import { listOrderSummaries, type SummaryView } from '@/domain/orders/summary';
import { currentScope } from '@/lib/auth/current';
import { cn } from '@/lib/utils';

interface PageProps {
  searchParams: Promise<{ gorunum?: string; q?: string }>;
}

const VIEWS: { value: SummaryView; label: string }[] = [
  { value: 'bekleyen', label: 'Teslim bekleyenler' },
  { value: 'teslim', label: 'Teslim edilenler' },
];

function href(path: string, view: SummaryView, query: string | undefined) {
  const params = new URLSearchParams();
  if (view !== 'bekleyen') params.set('gorunum', view);
  if (query) params.set('q', query);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * Dukkanin Excel'deki siparis listesinin karsiligi: kim, ne, ne zaman,
 * nereye — ve Excel'de olmayan odeme bilgisi.
 */
export default async function SiparisOzetiPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view: SummaryView = params.gorunum === 'teslim' ? 'teslim' : 'bekleyen';
  const query = params.q?.trim() || undefined;
  const rows = await listOrderSummaries(db, await currentScope(), { view, query });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Siparis ozeti</h1>
          <p className="text-sm text-neutral-500">
            {rows.length} siparis · satira tiklayinca siparis acilir
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/siparisler"
            className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4')}
          >
            Siparis listesi
          </Link>
          <Link
            href={href('/siparisler/ozet/yazdir', view, query)}
            className={cn(buttonVariants(), 'h-11 px-4')}
          >
            Yazdir
          </Link>
        </div>
      </div>

      <Suspense fallback={<div className="h-11" />}>
        <SearchBox placeholder="Musteri, telefon, siparis no, adres veya ilce ara" />
      </Suspense>

      <nav className="flex flex-wrap gap-2">
        {VIEWS.map((option) => (
          <Link
            key={option.value}
            href={href('/siparisler/ozet', option.value, query)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm',
              view === option.value
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500',
            )}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          {query ? `"${query}" icin siparis bulunamadi.` : 'Kayit yok.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <OrderSummaryTable rows={rows} view={view} linkRows />
        </div>
      )}
    </div>
  );
}
