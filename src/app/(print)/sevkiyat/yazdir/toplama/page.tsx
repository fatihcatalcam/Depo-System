import { PrintHeader } from '@/components/print-header';
import { db } from '@/db/client';
import { getDailyShipment } from '@/domain/shipments';
import { currentScope } from '@/lib/auth/current';
import { formatLongDate, todayInIstanbul } from '@/lib/dates';

interface PageProps {
  searchParams: Promise<{ tarih?: string }>;
}

/**
 * Depo toplama listesi: musteri musteri degil, parca parca toplam.
 * Depocu araca yuklerken tek kagida bakar, siparis siparis dolasmaz.
 */
export default async function ToplamaListesiPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.tarih ?? '')
    ? (params.tarih as string)
    : todayInIstanbul();

  const shipment = await getDailyShipment(db, await currentScope(), date);

  return (
    <>
      <PrintHeader title="Depo Toplama Listesi" subtitle={formatLongDate(date)} />

      {shipment.pickingList.length === 0 ? (
        <p className="text-sm">Bu tarihe planlanmis sevkiyat yok.</p>
      ) : (
        <>
          <p className="mb-3 text-sm">
            {shipment.stops.length} durak · toplam <strong>{shipment.totalPieces}</strong> parca
          </p>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-400 text-left">
                <th className="w-10 py-1.5">✓</th>
                <th className="py-1.5">Parca</th>
                <th className="py-1.5">Boyut</th>
                <th className="py-1.5">Kod</th>
                <th className="w-20 py-1.5 text-right">Adet</th>
              </tr>
            </thead>
            <tbody>
              {shipment.pickingList.map((item) => (
                <tr key={item.stockItemId} className="border-b border-neutral-200">
                  <td className="py-2">
                    {/* Depocu yukledikce elle isaretlesin */}
                    <span className="inline-block h-4 w-4 border border-neutral-500" />
                  </td>
                  <td className="py-2">
                    {item.stockItemName}
                    {item.variantLabel ? (
                      <span className="text-neutral-600"> · {item.variantLabel}</span>
                    ) : null}
                  </td>
                  <td className="py-2">{item.sizeLabel ?? '—'}</td>
                  <td className="py-2 text-xs text-neutral-600">{item.stockItemSku}</td>
                  <td className="py-2 text-right text-base font-bold tabular-nums">
                    {item.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 flex justify-between text-xs">
            <div>
              Hazirlayan: <span className="inline-block w-40 border-b border-neutral-400" />
            </div>
            <div>
              Kontrol: <span className="inline-block w-40 border-b border-neutral-400" />
            </div>
          </div>
        </>
      )}
    </>
  );
}
