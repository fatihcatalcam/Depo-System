import { CustomerForm } from '@/components/customer-form';
import { createCustomerAction } from '../actions';

export default function YeniMusteriPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Yeni müşteri</h1>
      <CustomerForm submitLabel="Müşteriyi kaydet" onSubmit={createCustomerAction} />
    </div>
  );
}
