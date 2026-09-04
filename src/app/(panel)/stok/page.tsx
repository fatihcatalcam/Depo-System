import Link from 'next/link';
import { Suspense } from 'react';
import { LockToggle } from '@/components/lock-toggle';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/client';
import { currentScope } from '@/lib/auth/current';
import { isStockLocked } from '@/lib/auth/locks';
import { cn } from '@/lib/utils';
import { listCategoryTree } from '@/domain/catalog/categories';
import { listStockItemsWithAvailability } from '@/domain/catalog/stock-items';
import { QuickAdjust } from './quick-adjust';
import { QuickNote } from './quick-note';
import { StockFilters } from './stock-filters';

interface PageProps {
  searchParams: Promise<{ q?: string; kategori?: string }>;
}

export default async function StokPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const locked = await isStockLocked(await currentScope());
  const [categories, items] = await Promise.all([
    listCategoryTree(db),
    listStockItemsWithAvailability(db, {
      query: params.q,
      categoryId: params.kategori || null,
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Stok</h1>
          <p className="text-sm text-neutral-500">{items.length} parca listeleniyor</p>
        </div>
        <div className="flex items-center gap-2">
          <LockToggle locked={locked} />
          <Link href="/stok/yeni" className={cn(buttonVariants(), 'h-11 px-4')}>
            Yeni parca
          </Link>
        </div>
      </div>

      <Suspense fallback={<div className="h-11" />}>
        <StockFilters categories={categories} />
      </Suspense>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="p-3">Parca</th>
              <th className="p-3">Boyut</th>
              <th className="p-3 text-center">Mevcut</th>
              <th className="p-3 text-right">Rezerve</th>
              <th className="p-3 text-right">Serbest</th>
              <th className="p-3">Not</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b border-neutral-100 last:border-0">
                <td className="p-3">
                  <Link href={`/stok/${item.id}`} className="font-medium hover:underline">
                    {item.name}
                  </Link>
                  <div className="text-xs text-neutral-400">{item.sku}</div>
                </td>
                <td className="p-3 text-neutral-600">
                  {item.sizeLabel ?? '—'}
                  {item.variantLabel ? (
                    <div className="text-xs text-neutral-400">{item.variantLabel}</div>
                  ) : null}
                </td>
                <td className="p-2">
                  <QuickAdjust
                    stockItemId={item.id}
                    stockItemName={item.name}
                    onHand={item.onHand}
                    locked={locked}
                  />
                </td>
                <td className="p-3 text-right tabular-nums text-neutral-500">{item.reserved}</td>
                <td
                  className={`p-3 text-right font-semibold tabular-nums ${
                    item.isBelowMinimum ? 'text-red-600' : 'text-neutral-900'
                  }`}
                >
                  {item.available}
                </td>
                <td className="w-56 p-2 align-top">
                  <QuickNote
                    stockItemId={item.id}
                    stockItemName={item.name}
                    note={item.notes}
                    locked={locked}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {items.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-500">Kayit bulunamadi.</p>
        ) : null}
      </div>
    </div>
  );
}
