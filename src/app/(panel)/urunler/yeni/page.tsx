import { createProductAction } from '../actions';
import { ProductForm } from '../product-form';

export default function YeniUrunPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Yeni urun</h1>
      <ProductForm submitLabel="Urunu kaydet" onSubmit={createProductAction} />
    </div>
  );
}
