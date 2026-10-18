import { redirect } from 'next/navigation';
import { OrderSummaryTable } from '@/components/order-summary-table';
import { PrintHeader } from '@/components/print-header';
import { db } from '@/db/client';
import { listBranches } from '@/domain/branches';
import { listOrderSummaries, type SummaryView } from '@/domain/orders/summary';
import { currentUser } from '@/lib/auth/current';
import { formatLongDate, todayInIstanbul } from '@/lib/dates';

interface PageProps {
  searchParams: Promise<{ gorunum?: string; q?: string; tarih?: string; sube?: string }>;
}

/** Siparis ozetinin kagit hali. Sutun cok oldugu icin yatay basiliyor. */
export default async function SiparisOzetiYazdirPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view: SummaryView = params.gorunum === 'teslim' ? 'teslim' : 'bekleyen';
  const query = params.q?.trim() || undefined;
  const date = params.tarih && /^\d{4}-\d{2}-\d{2}$/.test(params.tarih) ? params.tarih : undefined;
  const user = await currentUser();
  // Ozet yalnizca merkezde.
  if (!user.isCentral) redirect('/siparisler');
  const branch = (await listBranches(db)).find((option) => option.code === params.sube);
  const rows = await listOrderSummaries(db, user.scope, {
    view,
    query,
    date,
    branchId: branch?.id,
  });
  const title = date
    ? `${formatLongDate(date)} siparisleri`
    : view === 'teslim'
      ? 'Teslim edilen siparisler'
      : 'Teslim bekleyen siparisler';

  return (
    <>
      {/* Teslim edilmeyen mavi, edilen kirmizi: tarayici kagitta renkleri
          atmasin diye renk koruma acik. */}
      <style>
        {'@page { size: A4 landscape; margin: 10mm; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'}
      </style>
      <PrintHeader
        title={title}
        subtitle={`${formatLongDate(todayInIstanbul())}${branch ? ` · ${branch.name}` : ''}${query ? ` · arama: ${query}` : ''}`}
      />
      {rows.length === 0 ? (
        <p className="text-sm">Kayit yok.</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <OrderSummaryTable rows={rows} print />
        </div>
      )}
    </>
  );
}
