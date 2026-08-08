import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CustomerForm } from '@/components/customer-form';
import { db } from '@/db/client';
import { getCustomer } from '@/domain/parties/parties';
import { NotFoundError } from '@/lib/errors';
import { updateCustomerAction } from '../actions';

export default async function MusteriDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let customer;
  try {
    customer = await getCustomer(db, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">{customer.name}</h1>
        <p className="text-sm text-neutral-500">{customer.code}</p>
      </div>

      <p className="text-sm text-neutral-500">
        Bu musterinin siparisleri ve toplam borcu, siparis modulu geldiginde burada listelenecek.
      </p>

      <CustomerForm
        submitLabel="Degisiklikleri kaydet"
        initial={{
          name: customer.name,
          phone: customer.phone ?? '',
          phone2: customer.phone2 ?? '',
          email: customer.email ?? '',
          address: customer.address ?? '',
          city: customer.city ?? '',
          district: customer.district ?? '',
          taxOffice: customer.taxOffice ?? '',
          taxNumber: customer.taxNumber ?? '',
          notes: customer.notes ?? '',
        }}
        onSubmit={updateCustomerAction.bind(null, id)}
      />

      <Link href="/musteriler" className="inline-block text-sm text-neutral-500 hover:underline">
        Musteri listesine don
      </Link>
    </div>
  );
}
