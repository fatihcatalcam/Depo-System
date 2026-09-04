import { PrintHeader } from '@/components/print-header';
import { db } from '@/db/client';
import { getPeriodSummary, periodRange, type PeriodPreset } from '@/domain/reports';
import { formatDate, todayInIstanbul } from '@/lib/dates';
import { UnlockScreen } from '@/components/unlock-screen';
import { currentScope } from '@/lib/auth/current';
import { isReportsUnlocked } from '@/lib/auth/locks';
import { formatKurus } from '@/lib/money';

const PRESET_LABELS: Record<PeriodPreset, string> = {
  gun: 'Gunluk',
  hafta: 'Haftalik',
  ay: 'Aylik',
};

interface PageProps {
  searchParams: Promise<{ donem?: string; tarih?: string }>;
}

export default async function RaporYazdirPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const preset: PeriodPreset = (['gun', 'hafta', 'ay'] as const).includes(
    params.donem as PeriodPreset,
  )
    ? (params.donem as PeriodPreset)
    : 'ay';
  const reference = /^\d{4}-\d{2}-\d{2}$/.test(params.tarih ?? '')
    ? (params.tarih as string)
    : todayInIstanbul();

  const { from, to } = periodRange(preset, reference);
  const scope = await currentScope();

  // Yazdirma sayfasi rapor ekraninin kilidini atlatmamali.
  if (!(await isReportsUnlocked(scope))) {
    return (
      <UnlockScreen
        area="raporlar"
        title="Raporlar kilitli"
        description="Ciro, tahsilat ve alacak bilgileri icin yonetici parolasi gerekir."
      />
    );
  }

  const summary = await getPeriodSummary(db, scope, from, to);

  return (
    <>
      <PrintHeader
        title={`${PRESET_LABELS[preset]} Ozet`}
        subtitle={`${formatDate(from)} – ${formatDate(to)}`}
      />

      <table className="mb-6 w-full border-collapse text-sm">
        <tbody>
          <Row label="Siparis adedi" value={String(summary.orderCount)} />
          <Row label="Ciro" value={formatKurus(summary.revenueKurus)} />
          <Row label="Tahsilat" value={formatKurus(summary.collectedKurus)} />
          <Row label="Teslimat adedi" value={String(summary.deliveryCount)} />
          <Row
            label="Kalan alacak (rapor anindaki guncel durum)"
            value={formatKurus(summary.outstandingKurus)}
          />
          <Row
            label="Stok degeri (rapor anindaki guncel durum)"
            value={formatKurus(summary.stockValueKurus)}
          />
        </tbody>
      </table>

      <h2 className="mb-1 text-sm font-bold">En cok satan urunler</h2>
      {summary.topProducts.length === 0 ? (
        <p className="text-sm">Bu donemde siparis kaydi yok.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-400 text-left">
              <th className="py-1.5">Urun</th>
              <th className="w-20 py-1.5 text-right">Adet</th>
              <th className="w-32 py-1.5 text-right">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {summary.topProducts.map((row) => (
              <tr key={row.description} className="border-b border-neutral-200">
                <td className="py-1.5">{row.description}</td>
                <td className="py-1.5 text-right tabular-nums">{row.quantity}</td>
                <td className="py-1.5 text-right tabular-nums">{formatKurus(row.revenueKurus)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-neutral-200">
      <td className="py-2">{label}</td>
      <td className="py-2 text-right text-base font-bold tabular-nums">{value}</td>
    </tr>
  );
}
