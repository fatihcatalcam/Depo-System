import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { getProductWithComponents } from '@/domain/catalog/products';
import { NotFoundError } from '@/lib/errors';
import { formatKurus, kurusToTl } from '@/lib/money';
import { updateProductAction } from '../actions';
import { ProductForm } from '../product-form';
import { DuplicateDialog } from './duplicate-dialog';

export default async function UrunDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let product;
  try {
    product = await getProductWithComponents(db, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{product.name}</h1>
          <p className="text-sm text-neutral-500">
            {product.code}
            {product.defaultPriceKurus ? ` · ${formatKurus(product.defaultPriceKurus)}` : ''}
          </p>
        </div>
        <DuplicateDialog productId={product.id} productName={product.name} />
      </div>

      <ProductForm
        submitLabel="Degisiklikleri kaydet"
        initial={{
          name: product.name,
          defaultPrice: product.defaultPriceKurus
            ? kurusToTl(product.defaultPriceKurus).toFixed(2).replace('.', ',')
            : '',
          notes: product.notes ?? '',
          components: product.components.map((component) => ({
            stockItemId: component.stockItemId,
            label: `${component.stockItemName}${
              component.sizeLabel ? ` · ${component.sizeLabel}` : ''
            } (${component.stockItemSku})`,
            quantity: component.quantity,
          })),
        }}
        onSubmit={updateProductAction.bind(null, id)}
      />

      <Link href="/urunler" className="inline-block text-sm text-neutral-500 hover:underline">
        Urun listesine don
      </Link>
    </div>
  );
}
