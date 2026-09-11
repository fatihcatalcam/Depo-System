import Link from 'next/link';
import { db } from '@/db/client';
import { ORDER_STATUS_LABELS } from '@/domain/orders/orders';
import { getPendingOverview, type PendingItem } from '@/domain/orders/pending';
import { currentScope } from '@/lib/auth/current';
import { formatDate } from '@/lib/dates';

export const metadata = { title: 'Bekleyen urunler' };

function itemLabel(item: PendingItem): string {
  return [item.stockItemName, item.sizeLabel, item.variantLabel].filter(Boolean).join(' · ');
}

export default async function BekleyenPage() {
  const scope = await currentScope();
  const pending = await getPendingOverview(db, scope);

  if (pending.orders.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Bekleyen urunler</h1>
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
          Bekleyen siparis yok. Onaylanan siparisler teslim edilene kadar burada gorunur.
        </p>
      </div>
    );
  }

  const shortages = pending.totals.filter((item) => item.shortage > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Bekleyen urunler</h1>
          <p className="text-sm text-neutral-500">
            {pending.orders.length} siparis · {pending.totalPieces} parca bekliyor
          </p>
        </div>
        <Link href="/siparisler" className="text-sm text-neutral-500 hover:underline">
          Siparis listesi
        </Link>
      </div>

      {shortages.length > 0 ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {shortages.length} parcada depodaki adet yetmiyor. Asagidaki toplu listede kirmizi
          isaretli.
        </p>
      ) : null}

      {/* Madde 2: tum bekleyen siparislerin parcalari tek dokumde. Depocu ve
          atolye "ne yaptiracagiz" sorusunu buradan cevapliyor. */}
      <details className="overflow-hidden rounded-lg border border-neutral-200 bg-white" open>
        <summary className="cursor-pointer list-none p-3 text-sm font-semibold hover:bg-neutral-50">
          Tum bekleyen urunler ({pending.totals.length} kalem)
          <span className="ml-2 font-normal text-neutral-500">butun siparisler toplanmis</span>
        </summary>
        <table className="w-full border-t border-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Parca</th>
              <th className="w-24 p-3 text-right">Bekleyen</th>
              <th className="w-24 p-3 text-right">Depoda</th>
              <th className="w-24 p-3 text-right">Eksik</th>
            </tr>
          </thead>
          <tbody>
            {pending.totals.map((item) => (
              <tr
                key={item.stockItemId ?? `serbest:${item.stockItemName}`}
                className="border-b border-neutral-100 last:border-0"
              >
                <td className="p-3">
                  {item.stockItemId ? (
                    <Link href={`/stok/${item.stockItemId}`} className="hover:underline">
                      {itemLabel(item)}
                    </Link>
                  ) : (
                    <>
                      {itemLabel(item)}
                      <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-xs font-medium text-sky-800">
                        stok disi
                      </span>
                    </>
                  )}
                  {item.stockItemSku ? (
                    <span className="ml-2 text-xs text-neutral-400">{item.stockItemSku}</span>
                  ) : null}
                </td>
                <td className="p-3 text-right font-semibold tabular-nums">{item.quantity}</td>
                <td className="p-3 text-right tabular-nums text-neutral-600">
                  {item.onHand ?? '—'}
                </td>
                <td
                  className={`p-3 text-right font-semibold tabular-nums ${
                    item.shortage > 0 ? 'text-red-600' : 'text-neutral-300'
                  }`}
                >
                  {item.shortage > 0 ? item.shortage : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      {/* Madde 1: her musterinin yaninda kendi bekleyen urunlerini acan dugme. */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Musteriye gore</h2>
        {pending.orders.map((order) => (
          <details
            key={order.orderId}
            className="overflow-hidden rounded-lg border border-neutral-200 bg-white"
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-3 hover:bg-neutral-50">
              <span className="min-w-0 text-sm">
                <span className="font-medium">{order.customerName}</span>
                <span className="ml-2 text-xs text-neutral-400">{order.orderNo}</span>
              </span>
              <span className="flex items-center gap-2 whitespace-nowrap text-xs">
                <span className="text-neutral-500">
                  {formatDate(order.plannedDeliveryDate)} · {ORDER_STATUS_LABELS[order.status]}
                </span>
                <span className="rounded-full border border-neutral-300 px-2 py-1 font-medium text-neutral-700">
                  {order.pendingPieces} parca bekliyor
                </span>
              </span>
            </summary>
            <ul className="border-t border-neutral-200">
              {order.items.map((item, index) => (
                <li
                  key={`${item.stockItemId ?? item.stockItemName}-${index}`}
                  className="flex items-center justify-between gap-3 border-b border-neutral-100 p-3 text-sm last:border-0"
                >
                  <span className="min-w-0">{itemLabel(item)}</span>
                  <span className="font-semibold tabular-nums">{item.quantity}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-neutral-100 p-3">
              <Link
                href={`/siparisler/${order.orderId}`}
                className="text-sm text-neutral-500 hover:underline"
              >
                Siparisi ac
              </Link>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
