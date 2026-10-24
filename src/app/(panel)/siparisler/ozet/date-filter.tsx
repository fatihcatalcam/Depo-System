'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';

/**
 * Gun secici (`?tarih=`): secilen gun alinan siparisler. Adreste duruyor ki
 * yazdir baglantisi ve sayfa yenileme ayni gunu gostersin.
 */
export function DateFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function apply(value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set('tarih', value);
    else next.delete('tarih');
    const search = next.toString();
    router.push(search ? `${pathname}?${search}` : pathname);
  }

  return (
    <Input
      type="date"
      value={params.get('tarih') ?? ''}
      onChange={(event) => apply(event.target.value)}
      aria-label="Sipariş tarihi"
      className="h-11 w-auto"
    />
  );
}
