import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { db } from '@/db/client';
import { listProducts } from '@/domain/catalog/products';
import { formatKurus } from '@/lib/money';
import { cn } from '@/lib/utils';

export default async function UrunlerPage() {
  const products = await listProducts(db);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Urunler</h1>
          <p className="text-sm text-neutral-500">
            Satilan setler ve icerdikleri parcalar (recete)
          </p>
        </div>
        <Link href="/urunler/yeni" className={cn(buttonVariants(), 'h-11 px-4')}>
          Yeni urun
        </Link>
      </div>

      {products.length === 0 ? (
        <p className="text-sm text-neutral-500">Henuz urun tanimlanmadi.</p>
      ) : (
        <ul className="space-y-2">
          {products.map((product) => (
            <li key={product.id}>
              <Link
                href={`/urunler/${product.id}`}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400"
              >
                <span>
                  <span className="block text-sm font-medium">{product.name}</span>
                  <span className="block text-xs text-neutral-400">{product.code}</span>
                </span>
                <span className="text-sm text-neutral-600">
                  {product.defaultPriceKurus ? formatKurus(product.defaultPriceKurus) : 'Fiyat yok'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
