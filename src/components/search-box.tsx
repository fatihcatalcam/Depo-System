'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

/**
 * Adrese yazilan arama kutusu (`?q=`). Enter'da ya da kutudan cikinca
 * arar; her tusta sunucuya gitmez.
 *
 * Adreste durmasinin sebebi: sayfa yenilenince ya da geri gelinince arama
 * kaybolmasin, baglanti baskasina gonderilebilsin.
 */
export function SearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');

  function apply(value: string) {
    const next = new URLSearchParams(params.toString());
    const trimmed = value.trim();
    if (trimmed === (params.get('q') ?? '')) return;
    if (trimmed) next.set('q', trimmed);
    else next.delete('q');
    const search = next.toString();
    router.push(search ? `${pathname}?${search}` : pathname);
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') apply(query);
        }}
        onBlur={() => apply(query)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 pl-9"
      />
    </div>
  );
}
