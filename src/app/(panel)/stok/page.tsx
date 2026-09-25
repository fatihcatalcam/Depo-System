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
import { groupStockItems, type StockListItem } from './grouping';
import { StockFilters } from './stock-filters';
import { StockList } from './stock-list';

interface PageProps {
  searchParams: Promise<{ q?: string; kategori?: string }>;
}

/**
 * Stok listesi butun kartlari gostermeli.
 *
 * Varsayilan sinir (200) urun secicileri icin var: orada kullanici yazdikca
 * daralan bir liste soz konusu. Burada oyle degil — 567 kartin 200'unu
 * gostermek, ekrandaki adedin neden eksik oldugunu aciklanamaz hale getirir.
 */
const LIST_LIMIT = 5000;

export default async function StokPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await currentScope();
  const locked = await isStockLocked(scope);
  const [categories, items] = await Promise.all([
    listCategoryTree(db),
    listStockItemsWithAvailability(db, scope.stockBranchId, {
      query: params.q,
      categoryId: params.kategori || null,
      limit: LIST_LIMIT,
    }),
  ]);

  // Istemciye yalnizca listenin kullandigi alanlar gidiyor: kart tablosunun
  // tamami (barkod, alis fiyati, tarihler) 567 kez tasinacak veri degil.
  const rows: StockListItem[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    sizeLabel: item.sizeLabel,
    onHand: item.onHand,
    reserved: item.reserved,
    available: item.available,
    isBelowMinimum: item.isBelowMinimum,
    notes: item.notes,
  }));

  // Arama birkac model birakir, gruplari acik getirmek dogru. Kategori secimi
  // oyle degil: "Yatak" tek basina 180 parca, acik gelirse hicbir sey kazanmiyoruz.
  const searching = Boolean(params.q?.trim());
  const modelCount = groupStockItems(rows).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Stok</h1>
          <p className="text-sm text-neutral-500">
            {modelCount} model · {rows.length} parca
          </p>
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

      {/*
        Arama degisince liste bastan kuruluyor: acik/kapali secimleri onceki
        sonuclara aitti, yeni sonuclarda tasimanin anlami yok.
      */}
      <StockList
        key={`${params.q ?? ''}|${params.kategori ?? ''}`}
        items={rows}
        locked={locked}
        defaultOpen={searching}
      />
    </div>
  );
}
