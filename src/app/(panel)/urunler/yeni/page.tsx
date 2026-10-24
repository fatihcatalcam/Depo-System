import { createProductAction } from '../actions';
import { ProductForm } from '../product-form';

export default function YeniUrunPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Yeni ürün</h1>
      <ProductForm submitLabel="Ürünü kaydet" onSubmit={createProductAction} />
    </div>
  );
}
