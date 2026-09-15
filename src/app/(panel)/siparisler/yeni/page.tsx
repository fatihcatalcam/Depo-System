import { db } from '@/db/client';
import { listSalespeople } from '@/domain/parties/salespeople';
import { OrderForm } from '../order-form';

export default async function YeniSiparisPage() {
  const salespeople = await listSalespeople(db);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Yeni siparis</h1>
        <p className="text-sm text-neutral-500">
          Musteri, satici, teslimat adresi ve satirlari girin. Siparis once taslak olarak olusur.
        </p>
      </div>
      <OrderForm
        salespeople={salespeople.map((person) => ({ id: person.id, name: person.name }))}
      />
    </div>
  );
}
