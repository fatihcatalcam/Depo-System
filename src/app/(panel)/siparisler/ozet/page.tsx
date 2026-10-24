import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { BranchFilter } from '@/components/branch-filter';
import { OrderSummaryTable } from '@/components/order-summary-table';
import { SearchBox } from '@/components/search-box';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/client';
import { listBranches } from '@/domain/branches';
import { listOrderSummaries, type SummaryView } from '@/domain/orders/summary';
import { currentUser } from '@/lib/auth/current';
import { formatLongDate } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { DateFilter } from './date-filter';

interface PageProps {
  searchParams: Promise<{ gorunum?: string; q?: string; tarih?: string; sube?: string }>;
}

const VIEWS: { value: SummaryView; label: string }[] = [
  { value: 'bekleyen', label: 'Teslim bekleyenler' },
  { value: 'teslim', label: 'Teslim edilenler' },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function href(
  path: string,
  view: SummaryView,
  query: string | undefined,
  date?: string,
  branch?: string,
) {
  const params = new URLSearchParams();
  if (view !== 'bekleyen') params.set('gorunum', view);
  if (query) params.set('q', query);
  if (date) params.set('tarih', date);
  if (branch) params.set('sube', branch);
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/**
 * Dukkanin Excel'deki siparis listesinin karsiligi: kim, ne, ne zaman,
 * nereye — ve Excel'de olmayan odeme bilgisi.
 *
 * Gun secilince sekme yok sayilir: o gun alinan siparislerin hepsi.
 */
export default async function SiparisOzetiPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view: SummaryView = params.gorunum === 'teslim' ? 'teslim' : 'bekleyen';
  const query = params.q?.trim() || undefined;
  const date = params.tarih && DATE_PATTERN.test(params.tarih) ? params.tarih : undefined;
  const user = await currentUser();
  // Ozet yalnizca merkezde; sube kendi siparislerini siparis listesinden izliyor.
  if (!user.isCentral) redirect('/siparisler');
  const branches = (await listBranches(db)).filter((branch) => branch.isActive);
  const branch = branches.find((option) => option.code === params.sube);
  const rows = await listOrderSummaries(db, user.scope, {
    view,
    query,
    date,
    branchId: branch?.id,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {date ? `${formatLongDate(date)} siparişleri` : 'Sipariş özeti'}
          </h1>
          <p className="text-sm text-neutral-500">
            {rows.length} sipariş · satıra tıklayınca sipariş açılır · teslim tarihine tıklayınca
            değişir
          </p>
          <p className="text-sm">
            <span className="font-medium text-blue-700">Mavi: teslim edilmedi</span>
            <span className="text-neutral-400"> · </span>
            <span className="font-medium text-red-600">Kırmızı: teslim edildi</span>
            <span className="text-neutral-400"> · </span>
            <span className="text-neutral-600">Tık: fabrikaya sipariş geçildi</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/siparisler"
            className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4')}
          >
            Sipariş listesi
          </Link>
          <Link
            href={href('/siparisler/ozet/yazdir', view, query, date, branch?.code)}
            className={cn(buttonVariants(), 'h-11 px-4')}
          >
            Yazdır
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="min-w-0 flex-1">
          <Suspense fallback={<div className="h-11" />}>
            <SearchBox placeholder="Müşteri, telefon, sipariş no, adres veya ilçe ara" />
          </Suspense>
        </div>
        <Suspense fallback={<div className="h-11 w-40" />}>
          <DateFilter />
        </Suspense>
      </div>

      <nav className="flex flex-wrap items-center gap-2">
        {VIEWS.map((option) => (
          <Link
            key={option.value}
            href={href('/siparisler/ozet', option.value, query, undefined, branch?.code)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm',
              !date && view === option.value
                ? 'border-neutral-900 bg-neutral-900 text-white'
                : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500',
            )}
          >
            {option.label}
          </Link>
        ))}
        {date ? (
          <Link
            href={href('/siparisler/ozet', view, query, undefined, branch?.code)}
            className="rounded-full border border-neutral-900 bg-neutral-900 px-3 py-1.5 text-sm text-white"
          >
            {formatLongDate(date)} · tarihi temizle ×
          </Link>
        ) : null}
      </nav>

      {branches.length > 1 ? (
        <BranchFilter
          branches={branches}
          current={branch?.code}
          hrefFor={(code) => href('/siparisler/ozet', view, query, date, code)}
        />
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          {query
            ? `"${query}" için sipariş bulunamadı.`
            : date
              ? 'Bu gün alınan sipariş yok.'
              : 'Kayıt yok.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <OrderSummaryTable rows={rows} linkRows />
        </div>
      )}
    </div>
  );
}
