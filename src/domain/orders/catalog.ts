import { listProducts } from '@/domain/catalog/products';
import { searchStockItems } from '@/domain/catalog/stock-items';
import type { DbOrTx } from '@/db/types';
import { normalizeSearch } from '@/lib/catalog-search';

export interface CatalogProduct {
  id: string;
  name: string;
  code: string;
  defaultPriceKurus: number | null;
  haystack: string;
}

export interface CatalogStockItem {
  id: string;
  name: string;
  sku: string;
  sizeLabel: string | null;
  variantLabel: string | null;
  haystack: string;
}

export interface OrderCatalog {
  products: CatalogProduct[];
  stockItems: CatalogStockItem[];
}

/** Stok listesindeki sinirla ayni gerekce: hepsi gelmeli, 200'de kesilmemeli. */
const STOCK_LIMIT = 5000;

/**
 * Siparis formunun aradigi katalog, form acilirken bir kez.
 *
 * Yalnizca aramanin ve satirin ihtiyac duydugu alanlar gidiyor; alis fiyati
 * gibi alanlar tarayiciya tasinmiyor. Arama metni (`haystack`) burada bir kez
 * hazirlaniyor, her tusta yeniden degil.
 */
export async function loadOrderCatalog(db: DbOrTx): Promise<OrderCatalog> {
  const [productList, stockList] = await Promise.all([
    listProducts(db),
    searchStockItems(db, { limit: STOCK_LIMIT }),
  ]);

  return {
    products: productList.map((product) => ({
      id: product.id,
      name: product.name,
      code: product.code,
      defaultPriceKurus: product.defaultPriceKurus,
      haystack: normalizeSearch(`${product.name} ${product.code}`),
    })),
    stockItems: stockList.map((item) => ({
      id: item.id,
      name: item.name,
      sku: item.sku,
      sizeLabel: item.sizeLabel,
      variantLabel: item.variantLabel,
      haystack: normalizeSearch(
        [item.name, item.sizeLabel, item.variantLabel, item.sku, item.barcode]
          .filter(Boolean)
          .join(' '),
      ),
    })),
  };
}
