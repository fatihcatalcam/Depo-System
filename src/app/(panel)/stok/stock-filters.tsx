'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { flattenCategories } from '@/components/category-select';
import { Input } from '@/components/ui/input';
import type { CategoryNode } from '@/domain/catalog/categories';

export function StockFilters({ categories }: { categories: CategoryNode[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');

  function apply(next: Record<string, string>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    router.push(`/stok?${search.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') apply({ q: query });
        }}
        onBlur={() => apply({ q: query })}
        placeholder="Parca adi, SKU veya barkod ara"
        className="h-11"
      />
      <select
        defaultValue={params.get('kategori') ?? ''}
        onChange={(event) => apply({ kategori: event.target.value })}
        className="h-11 rounded-md border border-neutral-300 bg-white px-3 text-sm sm:w-64"
      >
        <option value="">Tum kategoriler</option>
        {flattenCategories(categories).map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
