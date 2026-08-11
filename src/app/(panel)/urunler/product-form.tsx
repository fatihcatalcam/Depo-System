'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { QuantityInput } from '@/components/quantity-input';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { searchStockItemsAction } from './actions';

interface ComponentRow {
  stockItemId: string;
  label: string;
  quantity: number;
}

interface ActionResultLike {
  ok: boolean;
  error?: string;
  id?: string;
}

interface SearchResult {
  id: string;
  name: string;
  sku: string;
  sizeLabel: string | null;
}

interface Props {
  initial?: { name: string; defaultPrice: string; notes: string; components: ComponentRow[] };
  submitLabel: string;
  onSubmit: (input: {
    name: string;
    defaultPrice?: string;
    notes?: string;
    components: { stockItemId: string; quantity: number }[];
  }) => Promise<ActionResultLike>;
}

export function ProductForm({ initial, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [defaultPrice, setDefaultPrice] = useState(initial?.defaultPrice ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [components, setComponents] = useState<ComponentRow[]>(initial?.components ?? []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setResults(await searchStockItemsAction(value));
  }

  function addComponent(item: SearchResult) {
    if (components.some((row) => row.stockItemId === item.id)) {
      toast.error('Bu parca zaten recetede var.');
      return;
    }
    setComponents((rows) => [
      ...rows,
      {
        stockItemId: item.id,
        label: `${item.name}${item.sizeLabel ? ` · ${item.sizeLabel}` : ''} (${item.sku})`,
        quantity: 1,
      },
    ]);
    setQuery('');
    setResults([]);
  }

  return (
    <form
      className="max-w-2xl space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await onSubmit({
            name,
            defaultPrice: defaultPrice || undefined,
            notes: notes || undefined,
            components: components.map((row) => ({
              stockItemId: row.stockItemId,
              quantity: row.quantity,
            })),
          });
          if (!result.ok) {
            toast.error(result.error ?? 'Kayit basarisiz.');
            return;
          }
          toast.success('Kaydedildi.');
          router.push(result.id ? `/urunler/${result.id}` : '/urunler');
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="product-name">Urun adi</Label>
        <Input
          id="product-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Yatak A 90x190 Tek Kisilik"
          className="h-11"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="product-price">Liste fiyati</Label>
          <Input
            id="product-price"
            value={defaultPrice}
            onChange={(event) => setDefaultPrice(event.target.value)}
            placeholder="Bos birakabilirsiniz"
            className="h-11"
          />
          <p className="text-xs text-neutral-500">
            Siparise otomatik gelir, siparis sirasinda degistirilebilir.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="product-notes">Not</Label>
          <Input
            id="product-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="component-search">Recete</Label>
        <Input
          id="component-search"
          value={query}
          onChange={(event) => void search(event.target.value)}
          placeholder="Parca ara ve ekle (en az 2 harf)"
          className="h-11"
        />

        {results.length > 0 ? (
          <ul className="rounded-lg border border-neutral-200 bg-white">
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => addComponent(item)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                >
                  {item.name}
                  {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
                  <span className="ml-2 text-xs text-neutral-400">{item.sku}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {components.length === 0 ? (
          <p className="text-sm text-neutral-500">Henuz parca eklenmedi.</p>
        ) : (
          <ul className="space-y-2">
            {components.map((row, index) => (
              <li
                key={row.stockItemId}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-3"
              >
                <span className="flex-1 text-sm">{row.label}</span>
                <QuantityInput
                  value={row.quantity}
                  aria-label={`${row.label} adedi`}
                  onValueChange={(quantity) =>
                    setComponents((rows) =>
                      rows.map((current, i) => (i === index ? { ...current, quantity } : current)),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => setComponents((rows) => rows.filter((_, i) => i !== index))}
                >
                  Kaldir
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Button
        type="submit"
        disabled={pending || components.length === 0}
        className="h-11 w-full sm:w-auto"
      >
        {pending ? 'Kaydediliyor...' : submitLabel}
      </Button>
    </form>
  );
}
