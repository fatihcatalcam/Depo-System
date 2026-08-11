import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/client';
import { searchCustomers } from '@/domain/parties/parties';
import { currentScope } from '@/lib/auth/current';
import { cn } from '@/lib/utils';

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function MusterilerPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const customers = await searchCustomers(db, await currentScope(), { query: q });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Musteriler</h1>
          <p className="text-sm text-neutral-500">{customers.length} kayit</p>
        </div>
        <Link href="/musteriler/yeni" className={cn(buttonVariants(), 'h-11 px-4')}>
          Yeni musteri
        </Link>
      </div>

      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Isim veya telefon ara"
          className="h-11 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm"
        />
        <button type="submit" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 px-4')}>
          Ara
        </button>
      </form>

      {customers.length === 0 ? (
        <p className="text-sm text-neutral-500">Kayit bulunamadi.</p>
      ) : (
        <ul className="space-y-2">
          {customers.map((customer) => (
            <li key={customer.id}>
              <Link
                href={`/musteriler/${customer.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{customer.name}</span>
                  <span className="block text-xs text-neutral-400">
                    {customer.code}
                    {customer.city ? ` · ${customer.city}` : ''}
                  </span>
                </span>
                <span className="whitespace-nowrap text-sm text-neutral-600">
                  {customer.phone ?? '—'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
