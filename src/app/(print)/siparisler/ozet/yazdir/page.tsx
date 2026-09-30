import { OrderSummaryTable } from '@/components/order-summary-table';
import { PrintHeader } from '@/components/print-header';
import { db } from '@/db/client';
import { listOrderSummaries, type SummaryView } from '@/domain/orders/summary';
import { currentScope } from '@/lib/auth/current';
import { formatLongDate, todayInIstanbul } from '@/lib/dates';

interface PageProps {
  searchParams: Promise<{ gorunum?: string; q?: string }>;
}

/** Siparis ozetinin kagit hali. Sutun cok oldugu icin yatay basiliyor. */
export default async function SiparisOzetiYazdirPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view: SummaryView = params.gorunum === 'teslim' ? 'teslim' : 'bekleyen';
  const query = params.q?.trim() || undefined;
  const rows = await listOrderSummaries(db, await currentScope(), { view, query });

  return (
    <>
      <style>{'@page { size: A4 landscape; margin: 10mm; }'}</style>
      <PrintHeader
        title={view === 'teslim' ? 'Teslim edilen siparisler' : 'Teslim bekleyen siparisler'}
        subtitle={`${formatLongDate(todayInIstanbul())}${query ? ` · arama: ${query}` : ''}`}
      />
      {rows.length === 0 ? (
        <p className="text-sm">Kayit yok.</p>
      ) : (
        <div className="overflow-x-auto print:overflow-visible">
          <OrderSummaryTable rows={rows} view={view} print />
        </div>
      )}
    </>
  );
}
