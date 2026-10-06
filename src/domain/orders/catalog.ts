import { eq } from 'drizzle-orm';
import { colorPalettes, productComponents, stockItems } from '@/db/schema';
import { listProducts } from '@/domain/catalog/products';
import { searchStockItems } from '@/domain/catalog/stock-items';
import { colorPartLabel, colorPartOrder } from '@/domain/orders/line-colors';
import type { DbOrTx } from '@/db/types';
import { normalizeSearch } from '@/lib/catalog-search';

/** Takimin renk secilebilen parcasi: "Baza" ve kartelasindaki kodlar. */
export interface CatalogColorPart {
  stockItemId: string;
  label: string;
  codes: string[];
}

export interface CatalogProduct {
  id: string;
  name: string;
  code: string;
  defaultPriceKurus: number | null;
  haystack: string;
  /** Renkli parcalari; bossa satirda renk secimi cikmaz. */
  colorParts: CatalogColorPart[];
}

export interface CatalogStockItem {
  id: string;
  name: string;
  sku: string;
  sizeLabel: string | null;
  variantLabel: string | null;
  haystack: string;
  /** Kartelasi varsa kodlar; tek parca satirinda renk secimi cikar. */
  colorCodes: string[];
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
  const [productList, stockList, palettes, colorComponents] = await Promise.all([
    listProducts(db),
    // Renk kartlari ayrica listelenmiyor: renk satirda seciliyor.
    searchStockItems(db, { limit: STOCK_LIMIT, baseOnly: true }),
    db.select({ id: colorPalettes.id, codes: colorPalettes.codes }).from(colorPalettes),
    db
      .select({
        productId: productComponents.productId,
        stockItemId: stockItems.id,
        name: stockItems.name,
        codes: colorPalettes.codes,
      })
      .from(productComponents)
      .innerJoin(stockItems, eq(stockItems.id, productComponents.stockItemId))
      .innerJoin(colorPalettes, eq(colorPalettes.id, stockItems.colorPaletteId)),
  ]);
  const paletteCodes = new Map(palettes.map((palette) => [palette.id, palette.codes]));

  return {
    products: productList.map((product) => ({
      id: product.id,
      name: product.name,
      code: product.code,
      defaultPriceKurus: product.defaultPriceKurus,
      haystack: normalizeSearch(`${product.name} ${product.code}`),
      colorParts: colorComponents
        .filter((row) => row.productId === product.id && row.codes.length > 0)
        .map((row) => ({ stockItemId: row.stockItemId, label: colorPartLabel(row.name), codes: row.codes }))
        // Baza once, baslik sonra: formda hep ayni sirada.
        .sort((a, b) => colorPartOrder(a.label) - colorPartOrder(b.label)),
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
      colorCodes: item.colorPaletteId ? (paletteCodes.get(item.colorPaletteId) ?? []) : [],
    })),
  };
}
