import BwipJs from 'bwip-js/node';
import { db } from '@/db/client';
import { listCategoryTree } from '@/domain/catalog/categories';
import { searchStockItems } from '@/domain/catalog/stock-items';
import { flattenCategories } from '@/components/category-select';
import { PrintButton } from './print-button';

interface PageProps {
  searchParams: Promise<{ kategori?: string; q?: string }>;
}

/**
 * Code128 barkodu SVG olarak uretir. SVG tercih ediliyor: yazicida
 * cozunurlukten bagimsiz keskin cikar ve PNG'ye gore cok daha kucuk.
 */
function barcodeImage(text: string): string | null {
  try {
    const svg = BwipJs.toSVG({
      bcid: 'code128',
      text,
      scale: 3,
      height: 12,
      includetext: false,
    });
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  } catch {
    return null;
  }
}

export default async function EtiketPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [categories, items] = await Promise.all([
    listCategoryTree(db),
    searchStockItems(db, { query: params.q, categoryId: params.kategori || null, limit: 120 }),
  ]);

  const labels = items
    .filter((item) => item.barcode)
    .map((item) => ({
      id: item.id,
      name: item.name,
      sizeLabel: item.sizeLabel,
      sku: item.sku,
      barcode: item.barcode as string,
      image: barcodeImage(item.barcode as string),
    }));

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="text-lg font-semibold">Barkod etiketleri</h1>
        <p className="text-sm text-neutral-500">
          Filtreleyip yazdirin. A4 sayfada 3 sutun halinde cikar.
        </p>
      </div>

      <form className="flex flex-col gap-2 sm:flex-row print:hidden">
        <input
          name="q"
          defaultValue={params.q ?? ''}
          placeholder="Parca ara"
          className="h-11 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        />
        <select
          name="kategori"
          defaultValue={params.kategori ?? ''}
          className="h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm sm:w-64"
        >
          <option value="">Tum kategoriler</option>
          {flattenCategories(categories).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="submit" className="h-11 rounded-md border border-neutral-300 bg-white px-4 text-sm">
          Filtrele
        </button>
        <PrintButton count={labels.length} />
      </form>

      {labels.length === 0 ? (
        <p className="text-sm text-neutral-500 print:hidden">Yazdirilacak etiket yok.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {labels.map((label) => (
            <div
              key={label.id}
              className="break-inside-avoid rounded border border-neutral-300 bg-white p-2 text-center"
            >
              <div className="truncate text-[11px] font-medium">{label.name}</div>
              <div className="text-[10px] text-neutral-500">{label.sizeLabel ?? ' '}</div>
              {label.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={label.image} alt={label.barcode} className="mx-auto h-10 w-full object-contain" />
              ) : (
                <div className="py-3 text-[10px] text-red-600">Barkod uretilemedi</div>
              )}
              <div className="text-[10px] tracking-wider text-neutral-600">{label.barcode}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
