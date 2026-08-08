import Link from 'next/link';
import { db } from '@/db/client';
import { listStockItemsWithAvailability } from '@/domain/catalog/stock-items';

export default async function AnaSayfa() {
  const items = await listStockItemsWithAvailability(db, {});
  const critical = items.filter((item) => item.isBelowMinimum);
  const totalOnHand = items.reduce((sum, item) => sum + item.onHand, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Ana sayfa</h1>
        <p className="text-sm text-neutral-500">
          Siparis, teslimat ve odeme ozetleri sonraki asamalarda eklenecek.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Parca cesidi" value={items.length} />
        <Card label="Depodaki toplam adet" value={totalOnHand} />
        <Card label="Kritik seviyede" value={critical.length} danger={critical.length > 0} />
      </div>

      {critical.length > 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white">
          <h2 className="border-b border-neutral-200 p-3 text-sm font-semibold">
            Kritik seviyedeki parcalar
          </h2>
          <ul>
            {critical.map((item) => (
              <li key={item.id} className="border-b border-neutral-100 last:border-0">
                <Link
                  href={`/stok/${item.id}`}
                  className="flex items-center justify-between p-3 text-sm hover:bg-neutral-50"
                >
                  <span>
                    {item.name}
                    {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
                  </span>
                  <span className="font-semibold tabular-nums text-red-600">
                    {item.available} / {item.minStockLevel}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Card({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
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
