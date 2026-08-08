'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Supplier } from '@/domain/parties/parties';
import { createGoodsReceiptAction, findStockItemsAction } from '../actions';

interface LineRow {
  stockItemId: string;
  label: string;
  quantity: number;
  unitCost: string;
}

interface SearchResult {
  id: string;
  name: string;
  sku: string;
  sizeLabel: string | null;
  barcode: string | null;
}

function labelFor(item: SearchResult) {
  return `${item.name}${item.sizeLabel ? ` · ${item.sizeLabel}` : ''} (${item.sku})`;
}

export function ReceiptForm({ suppliers }: { suppliers: Supplier[] }) {
  const [supplierId, setSupplierId] = useState('');
  const [waybillNo, setWaybillNo] = useState('');
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineRow[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function addItem(item: SearchResult) {
    setQuery('');
    setResults([]);
    setLines((rows) => {
      const existing = rows.findIndex((row) => row.stockItemId === item.id);
      // Ayni parca ikinci kez okutulursa yeni satir acmak yerine adedi artir:
      // depoda barkod arka arkaya okutulur, bu en dogal davranis.
      if (existing >= 0) {
        toast.success(`${item.name} adedi artirildi.`);
        return rows.map((row, i) =>
          i === existing ? { ...row, quantity: row.quantity + 1 } : row,
        );
      }
      return [...rows, { stockItemId: item.id, label: labelFor(item), quantity: 1, unitCost: '' }];
    });
  }

  async function search(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setResults(await findStockItemsAction(value));
  }

  async function handleScan(text: string) {
    setScanning(false);
    const found = await findStockItemsAction(text);
    const exact = found.find((item) => item.barcode === text || item.sku === text);
    if (exact) addItem(exact);
    else toast.error(`Barkod eslesmedi: ${text}`);
  }

  const totalQuantity = lines.reduce((sum, row) => sum + row.quantity, 0);

  return (
    <>
      {scanning ? (
        <BarcodeScanner onDetected={handleScan} onClose={() => setScanning(false)} />
      ) : null}

      <form
        className="max-w-2xl space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await createGoodsReceiptAction({
              supplierId: supplierId || null,
              waybillNo: waybillNo || undefined,
              receivedAt,
              notes: notes || undefined,
              lines: lines.map((row) => ({
                stockItemId: row.stockItemId,
                quantity: row.quantity,
                unitCost: row.unitCost || undefined,
              })),
            });
            if (!result.ok) {
              toast.error(result.error ?? 'Kayit basarisiz.');
              return;
            }
            toast.success('Mal kabul kaydedildi, stok guncellendi.');
            router.push(result.id ? `/mal-kabul/${result.id}` : '/mal-kabul');
            router.refresh();
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="supplier">Tedarikci</Label>
            <select
              id="supplier"
              value={supplierId}
              onChange={(event) => setSupplierId(event.target.value)}
              className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
            >
              <option value="">Belirtilmedi</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="waybill">Irsaliye no</Label>
            <Input
              id="waybill"
              value={waybillNo}
              onChange={(event) => setWaybillNo(event.target.value)}
              placeholder="IRS-2026-001"
              className="h-11"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="received">Gelis tarihi</Label>
            <Input
              id="received"
              type="date"
              value={receivedAt}
              onChange={(event) => setReceivedAt(event.target.value)}
              className="h-11"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="receipt-notes">Not</Label>
            <Input
              id="receipt-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="h-11"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="item-search">Gelen parcalar</Label>
          <div className="flex gap-2">
            <Input
              id="item-search"
              value={query}
              onChange={(event) => void search(event.target.value)}
              placeholder="Parca ara (en az 2 harf)"
              className="h-11"
            />
            <Button type="button" variant="outline" className="h-11" onClick={() => setScanning(true)}>
              Barkod
            </Button>
          </div>

          {results.length > 0 ? (
            <ul className="rounded-lg border border-neutral-200 bg-white">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => addItem(item)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-neutral-50"
                  >
                    {labelFor(item)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {lines.length === 0 ? (
            <p className="text-sm text-neutral-500">Henuz parca eklenmedi.</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((row, index) => (
                <li
                  key={row.stockItemId}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white p-3"
                >
                  <span className="min-w-0 flex-1 text-sm">{row.label}</span>
                  <Input
                    type="number"
                    min={1}
                    value={row.quantity}
                    onChange={(event) =>
                      setLines((rows) =>
                        rows.map((current, i) =>
                          i === index
                            ? { ...current, quantity: Math.max(1, Number(event.target.value) || 1) }
                            : current,
                        ),
                      )
                    }
                    className="h-10 w-20"
                    aria-label="Adet"
                  />
                  <Input
                    value={row.unitCost}
                    onChange={(event) =>
                      setLines((rows) =>
                        rows.map((current, i) =>
                          i === index ? { ...current, unitCost: event.target.value } : current,
                        ),
                      )
                    }
                    placeholder="Birim alis"
                    className="h-10 w-28"
                    aria-label="Birim alis fiyati"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-600"
                    onClick={() => setLines((rows) => rows.filter((_, i) => i !== index))}
                  >
                    Kaldir
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {lines.length > 0 ? (
            <p className="text-sm text-neutral-600">
              {lines.length} kalem · toplam {totalQuantity} adet
            </p>
          ) : null}
        </div>

        <Button type="submit" disabled={pending || lines.length === 0} className="h-11 w-full sm:w-auto">
          {pending ? 'Kaydediliyor...' : 'Mal kabulu kaydet ve stoga isle'}
        </Button>
      </form>
    </>
  );
}
