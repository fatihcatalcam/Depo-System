import { StockItemForm } from '@/components/stock-item-form';
import { db } from '@/db/client';
import { listCategoryTree } from '@/domain/catalog/categories';
import { createStockItemAction } from '../actions';

export default async function YeniParcaPage() {
  const categories = await listCategoryTree(db);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Yeni parca</h1>
      <StockItemForm
        categories={categories}
        submitLabel="Parcayi kaydet"
        onSubmit={createStockItemAction}
        redirectBase="/stok"
      />
    </div>
  );
}
