import { CustomerForm } from '@/components/customer-form';
import { createCustomerAction } from '../actions';

export default function YeniMusteriPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Yeni musteri</h1>
      <CustomerForm submitLabel="Musteriyi kaydet" onSubmit={createCustomerAction} />
    </div>
  );
}
