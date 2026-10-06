import { StockItemForm } from '@/components/stock-item-form';
import { db } from '@/db/client';
import { listCategoryTree } from '@/domain/catalog/categories';
import { listPalettes } from '@/domain/catalog/colors';
import { createStockItemAction } from '../actions';

export default async function YeniParcaPage() {
  const [categories, palettes] = await Promise.all([listCategoryTree(db), listPalettes(db)]);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Yeni parca</h1>
      <StockItemForm
        categories={categories}
        palettes={palettes.map((palette) => ({ id: palette.id, name: palette.name }))}
        submitLabel="Parcayi kaydet"
        onSubmit={createStockItemAction}
        redirectBase="/stok"
      />
    </div>
  );
}
