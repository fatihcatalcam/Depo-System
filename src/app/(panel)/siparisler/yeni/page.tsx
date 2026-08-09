import { OrderForm } from '../order-form';

export default function YeniSiparisPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Yeni siparis</h1>
        <p className="text-sm text-neutral-500">
          Musteri, teslimat adresi ve satirlari girin. Siparis once taslak olarak olusur.
        </p>
      </div>
      <OrderForm />
    </div>
  );
}
