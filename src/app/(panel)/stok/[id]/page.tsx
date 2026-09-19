import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { StockItemForm } from '@/components/stock-item-form';
import { db } from '@/db/client';
import { stockItems } from '@/db/schema';
import { listCategoryTree } from '@/domain/catalog/categories';
import { getAvailability, getReservationBreakdown } from '@/domain/stock/availability';
import { MOVEMENT_LABELS, listStockHistory } from '@/domain/stock/history';
import { currentScope } from '@/lib/auth/current';
import { formatKurus, kurusToTl } from '@/lib/money';
import { updateStockItemAction } from '../actions';
import { StockCountForm } from './stock-count-form';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

export default async function StokDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [item] = await db.select().from(stockItems).where(eq(stockItems.id, id));
  if (!item) notFound();

  const scope = await currentScope();
  const [availability, reservations, history, categories] = await Promise.all([
    getAvailability(db, scope.branchId, id),
    getReservationBreakdown(db, scope.branchId, id),
    listStockHistory(db, scope.branchId, id),
    listCategoryTree(db),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{item.name}</h1>
        <p className="text-sm text-neutral-500">
          {item.sku}
          {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
          {item.barcode ? ` · Barkod: ${item.barcode}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Mevcut" value={availability.onHand} />
        <Stat label="Rezerve" value={availability.reserved} muted />
        <Stat
          label="Serbest"
          value={availability.available}
          danger={availability.available < item.minStockLevel}
        />
      </div>

      {reservations.length > 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold">Rezervasyonlar</h2>
          <ul className="space-y-1 text-sm">
            {reservations.map((line) => (
              <li
                key={line.orderId ?? 'diger-sube'}
                className="flex items-center justify-between gap-3"
              >
                {line.orderId ? (
                  <Link
                    href={`/siparisler/${line.orderId}`}
                    className="min-w-0 truncate hover:underline"
                  >
                    {line.orderNo} · {line.label}
                  </Link>
                ) : (
                  // Diger subenin siparisi: adet gorunur, sebebi gorunmez.
                  <span className="min-w-0 truncate text-neutral-500">{line.label}</span>
                )}
                <span className="whitespace-nowrap tabular-nums text-neutral-600">
                  {line.quantity}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {item.purchasePriceKurus ? (
        <p className="text-sm text-neutral-500">
          Alis fiyati: {formatKurus(item.purchasePriceKurus)}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-200 p-3 text-sm font-semibold">
            Hareket gecmisi
          </h2>
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="p-3">Tarih</th>
                <th className="p-3">Tip</th>
                <th className="p-3 text-right">Degisim</th>
                <th className="p-3 text-right">Bakiye</th>
                <th className="p-3">Not</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id} className="border-b border-neutral-100 last:border-0">
                  <td className="whitespace-nowrap p-3 text-neutral-600">
                    {dateFormatter.format(entry.createdAt)}
                  </td>
                  <td className="p-3">{MOVEMENT_LABELS[entry.movementType]}</td>
                  <td
                    className={`p-3 text-right font-medium tabular-nums ${
                      entry.quantityChange > 0 ? 'text-green-700' : 'text-red-600'
                    }`}
                  >
                    {entry.quantityChange > 0 ? '+' : ''}
                    {entry.quantityChange}
                  </td>
                  <td className="p-3 text-right tabular-nums">{entry.balanceAfter}</td>
                  <td className="p-3 text-neutral-500">{entry.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 ? (
            <p className="p-6 text-center text-sm text-neutral-500">Henuz hareket yok.</p>
          ) : null}
        </div>

        <StockCountForm stockItemId={item.id} currentQuantity={availability.onHand} />
      </div>

      <details className="rounded-lg border border-neutral-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold">Kart bilgilerini duzenle</summary>
        <div className="pt-4">
          <StockItemForm
            categories={categories}
            submitLabel="Degisiklikleri kaydet"
            initial={{
              name: item.name,
              sizeLabel: item.sizeLabel ?? '',
              categoryId: item.categoryId ?? '',
              barcode: item.barcode ?? '',
              minStockLevel: String(item.minStockLevel),
              purchasePrice: item.purchasePriceKurus
                ? kurusToTl(item.purchasePriceKurus).toFixed(2).replace('.', ',')
                : '',
              notes: item.notes ?? '',
            }}
            onSubmit={updateStockItemAction.bind(null, item.id)}
            redirectBase="/stok"
          />
        </div>
      </details>

      <Link href="/stok" className="inline-block text-sm text-neutral-500 hover:underline">
        Stok listesine don
      </Link>
    </div>
  );
}

function Stat({
  label,
  value,
  muted,
  danger,
}: {
  label: string;
  value: number;
  muted?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-xs uppercase text-neutral-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          danger ? 'text-red-600' : muted ? 'text-neutral-500' : 'text-neutral-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}
