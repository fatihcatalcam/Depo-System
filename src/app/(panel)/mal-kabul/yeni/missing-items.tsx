'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Belgede olup katalogla eslesmeyen satir. Yapay zeka katalogda gercekten
 * olmadigini dusunuyorsa bir kart onerir (ad, olcu, kategori); oneri yoksa
 * alanlar bos gelir, kullanici yazabilir.
 */
export interface MissingRow {
  key: string;
  /** Belgede yazdigi gibi. */
  text: string;
  quantity: number;
  unitCost: string;
  name: string;
  sizeLabel: string;
  categoryId: string;
}

interface Props {
  rows: MissingRow[];
  categories: { id: string; label: string }[];
  /** "Ara" ile mevcut kart secilirken hangi satir icin oldugu. */
  resolving: string | null;
  onChange: (rows: MissingRow[]) => void;
  onAdd: (rows: MissingRow[]) => void;
  onSearch: (row: MissingRow) => void;
}

/**
 * "Bu urunler katalogda yok. Stoklara eklensin mi?"
 *
 * Hicbir kart kendiliginden acilmaz. Kullanici her satir icin karar verir:
 * yeni kart olarak ekle (ad, olcu ve kategori duzeltilebilir), mevcut bir
 * karti ara ya da satiri birak. Eklenen kart "Kaydet"e basilinca mal kabulle
 * birlikte acilir. Stok kartlari silinmedigi icin yanlis acilan kart kalici
 * olurdu; soru bu yuzden.
 */
export function MissingItems({ rows, categories, resolving, onChange, onAdd, onSearch }: Props) {
  if (rows.length === 0) return null;

  const ready = rows.filter((row) => row.name.trim() !== '');

  function update(key: string, patch: Partial<MissingRow>) {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-amber-900">
            Bu urunler katalogda yok. Stoklara eklensin mi?
          </p>
          <p className="text-xs text-amber-800">
            Eklediginiz urun icin yeni stok karti acilir; kart, mal kabulu kaydettiginizde
            olusur. Katalogda varsa ama farkli yazildiysa &quot;Mevcut karti ara&quot; ile secin.
          </p>
        </div>
        {ready.length > 1 ? (
          <Button type="button" variant="outline" className="h-9" onClick={() => onAdd(ready)}>
            Onerilenlerin hepsini ekle ({ready.length})
          </Button>
        ) : null}
      </div>

      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.key} className="space-y-2 rounded-md border border-amber-200 bg-white p-2">
            <p className="text-sm text-amber-950">
              Belgede: <span className="font-medium">{row.text}</span> ·{' '}
              <strong>{row.quantity} adet</strong>
            </p>
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
              <Input
                value={row.name}
                onChange={(event) => update(row.key, { name: event.target.value })}
                placeholder="Yeni kartin adi"
                aria-label={`${row.text} icin yeni kart adi`}
                className="h-10"
              />
              <Input
                value={row.sizeLabel}
                onChange={(event) => update(row.key, { sizeLabel: event.target.value })}
                placeholder="Olcu (ornek: 160x200)"
                aria-label={`${row.text} icin olcu`}
                className="h-10"
              />
              <select
                value={row.categoryId}
                onChange={(event) => update(row.key, { categoryId: event.target.value })}
                aria-label={`${row.text} icin kategori`}
                className="h-10 rounded-md border border-neutral-300 bg-white px-2 text-sm"
              >
                <option value="">Kategori secin</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-9"
                disabled={row.name.trim() === ''}
                onClick={() => onAdd([row])}
              >
                Stoklara ekle
              </Button>
              <Button type="button" variant="outline" className="h-9" onClick={() => onSearch(row)}>
                {resolving === row.key ? 'Asagidan secin' : 'Mevcut karti ara'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 text-red-600"
                onClick={() => onChange(rows.filter((other) => other.key !== row.key))}
              >
                Kaldir
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
