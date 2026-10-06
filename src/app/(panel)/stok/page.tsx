import Link from 'next/link';
import { Suspense } from 'react';
import { LockToggle } from '@/components/lock-toggle';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/client';
import { currentScope } from '@/lib/auth/current';
import { isStockLocked } from '@/lib/auth/locks';
import { cn } from '@/lib/utils';
import { listCategoryTree } from '@/domain/catalog/categories';
import { listPalettes } from '@/domain/catalog/colors';
import { listProductComponentRows } from '@/domain/catalog/products';
import { listStockItemsWithAvailability } from '@/domain/catalog/stock-items';
import { buildStockGrid, filterStockGrid, type GridItem, type GridProduct } from './grid';
import { StockFilters } from './stock-filters';
import { StockGridView } from './stock-grid-view';

interface PageProps {
  searchParams: Promise<{ q?: string; kategori?: string }>;
}

/**
 * Butun kartlar gelmeli. Varsayilan sinir (200) urun secicileri icin var;
 * burada 567 kartin 200'unu gostermek ekrandaki adedi aciklanamaz yapar.
 */
const LIST_LIMIT = 5000;

export default async function StokPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const scope = await currentScope();
  const locked = await isStockLocked(scope);
  const [categories, stock, componentRows, palettes] = await Promise.all([
    listCategoryTree(db),
    listStockItemsWithAvailability(db, scope.stockBranchId, { limit: LIST_LIMIT }),
    listProductComponentRows(db),
    listPalettes(db),
  ]);
  const paletteCodes = new Map(palettes.map((palette) => [palette.id, palette.codes]));

  const categoryNames = new Map<string, string>();
  const collect = (nodes: typeof categories) => {
    for (const node of nodes) {
      categoryNames.set(node.id, node.name);
      collect(node.children);
    }
  };
  collect(categories);

  // Istemciye yalnizca ekranin kullandigi alanlar gidiyor: kart tablosunun
  // tamami (alis fiyati, tarihler) 567 kez tasinacak veri degil.
  const items: GridItem[] = stock.map((item) => ({
    id: item.id,
    name: item.name,
    sizeLabel: item.sizeLabel,
    categoryId: item.categoryId,
    categoryName: item.categoryId ? (categoryNames.get(item.categoryId) ?? null) : null,
    onHand: item.onHand,
    reserved: item.reserved,
    notes: item.notes,
    sku: item.sku,
    barcode: item.barcode,
    variantLabel: item.variantLabel,
    parentId: item.parentStockItemId,
    colorCodes: item.colorPaletteId ? (paletteCodes.get(item.colorPaletteId) ?? []) : [],
  }));

  const products = new Map<string, GridProduct>();
  for (const row of componentRows) {
    const product = products.get(row.productId) ?? {
      id: row.productId,
      name: row.productName,
      components: [],
    };
    product.components.push({ stockItemId: row.stockItemId, quantity: row.quantity });
    products.set(row.productId, product);
  }

  // Takimlar butun kartlar uzerinden kuruluyor, arama sonra: aranan parca bir
  // takimin icindeyse satiri eksiksiz gelsin, yalniz o parca degil.
  const grid = filterStockGrid(buildStockGrid(items, [...products.values()]), {
    query: params.q,
    categoryId: params.kategori || null,
  });
  const setRows = grid.models.reduce((sum, model) => sum + model.sets.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Stok</h1>
          <p className="text-base text-neutral-500">
            {setRows} takim · {grid.others.length} diger urun
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

      <StockGridView grid={grid} locked={locked} />
    </div>
  );
}
