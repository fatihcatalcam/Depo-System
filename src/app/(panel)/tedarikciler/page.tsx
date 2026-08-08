import { revalidatePath } from 'next/cache';
import { db } from '@/db/client';
import { createSupplier, listSuppliers } from '@/domain/parties/parties';
import { DomainError } from '@/lib/errors';

async function addSupplier(formData: FormData) {
  'use server';
  const name = String(formData.get('name') ?? '');
  try {
    await createSupplier(db, {
      name,
      phone: String(formData.get('phone') ?? ''),
      address: String(formData.get('address') ?? ''),
    });
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
  }
  revalidatePath('/tedarikciler');
}

export default async function TedarikcilerPage() {
  const suppliers = await listSuppliers(db);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Tedarikciler</h1>
        <p className="text-sm text-neutral-500">
          Mal kabul kaydederken hangi fabrikadan geldigini secebilmek icin.
        </p>
      </div>

      <form
        action={addSupplier}
        className="grid gap-2 rounded-lg border border-neutral-200 bg-white p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
      >
        <input
          name="name"
          required
          placeholder="Tedarikci adi"
          className="h-11 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <input
          name="phone"
          placeholder="Telefon"
          className="h-11 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <input
          name="address"
          placeholder="Adres"
          className="h-11 rounded-md border border-neutral-300 px-3 text-sm"
        />
        <button
          type="submit"
          className="h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white"
        >
          Ekle
        </button>
      </form>

      {suppliers.length === 0 ? (
        <p className="text-sm text-neutral-500">Henuz tedarikci yok.</p>
      ) : (
        <ul className="space-y-2">
          {suppliers.map((supplier) => (
            <li
              key={supplier.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white p-4"
            >
              <span>
                <span className="block text-sm font-medium">{supplier.name}</span>
                <span className="block text-xs text-neutral-400">
                  {supplier.code}
                  {supplier.address ? ` · ${supplier.address}` : ''}
                </span>
              </span>
              <span className="text-sm text-neutral-600">{supplier.phone ?? '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
