'use client';

import { FileScan } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { QuantityInput } from '@/components/quantity-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Supplier } from '@/domain/parties/parties';
import { shrinkImage } from '@/lib/shrink-image';
import { foldText } from '@/lib/text';
import {
  createGoodsReceiptAction,
  findStockItemsAction,
  readReceiptDocumentAction,
} from '../actions';

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

/** Yapay zekanin okuyup katalogla eslestiremedigi satir; kullanici elle secer. */
interface UnmatchedRow {
  key: string;
  text: string;
  quantity: number;
  unitCost: string;
}

const priceFormatter = new Intl.NumberFormat('tr-TR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 1250.5 -> "1.250,50": formdaki fiyat alanlariyla ayni bicim. */
function toPriceInput(value: number | null): string {
  return value === null ? '' : priceFormatter.format(value);
}

interface Props {
  suppliers: Supplier[];
  /** OPENAI_API_KEY tanimli mi; degilse "belgeden oku" kapali. */
  aiEnabled: boolean;
}

export function ReceiptForm({ suppliers, aiEnabled }: Props) {
  const [supplierId, setSupplierId] = useState('');
  const [waybillNo, setWaybillNo] = useState('');
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineRow[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reading, setReading] = useState(false);
  const [unmatched, setUnmatched] = useState<UnmatchedRow[]>([]);
  // Eslesmeyen bir satir icin arama yapiliyorsa, secilen parca o satirin
  // adedini ve fiyatini alsin.
  const [resolving, setResolving] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function readDocument(file: File) {
    setReading(true);
    try {
      const formData = new FormData();
      formData.set('document', await shrinkImage(file));
      const result = await readReceiptDocumentAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      if (result.waybillNo && !waybillNo) setWaybillNo(result.waybillNo);
      if (result.date) setReceivedAt(result.date);
      if (result.supplierName && !supplierId) {
        const wanted = foldText(result.supplierName);
        const match = suppliers.find((supplier) => {
          const name = foldText(supplier.name);
          return name.includes(wanted) || wanted.includes(name);
        });
        if (match) setSupplierId(match.id);
      }

      const matched = result.lines.filter((line) => line.stockItemId);
      setLines((rows) => {
        const next = [...rows];
        for (const line of matched) {
          const existing = next.findIndex((row) => row.stockItemId === line.stockItemId);
          if (existing >= 0) {
            next[existing] = {
              ...next[existing],
              quantity: next[existing].quantity + line.quantity,
              unitCost: next[existing].unitCost || toPriceInput(line.unitPrice),
            };
          } else {
            next.push({
              stockItemId: line.stockItemId as string,
              label: line.label ?? line.text,
              quantity: line.quantity,
              unitCost: toPriceInput(line.unitPrice),
            });
          }
        }
        return next;
      });

      const missing = result.lines
        .filter((line) => !line.stockItemId)
        .map((line) => ({
          key: crypto.randomUUID(),
          text: line.text,
          quantity: line.quantity,
          unitCost: toPriceInput(line.unitPrice),
        }));
      setUnmatched((rows) => [...rows, ...missing]);

      if (result.lines.length === 0) {
        toast.error('Belgede urun satiri bulunamadi.');
      } else {
        toast.success(
          `${matched.length} satir forma eklendi` +
            (missing.length > 0 ? `, ${missing.length} satir eslesmedi` : '') +
            '. Kontrol edip kaydedin.',
        );
      }
    } catch (error) {
      console.error(error);
      toast.error('Belge okunamadi.');
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function addItem(item: SearchResult) {
    setQuery('');
    setResults([]);
    const source = resolving ? unmatched.find((row) => row.key === resolving) : undefined;
    if (source) {
      setUnmatched((rows) => rows.filter((row) => row.key !== source.key));
      setResolving(null);
    }
    const quantity = source?.quantity ?? 1;
    const unitCost = source?.unitCost ?? '';
    setLines((rows) => {
      const existing = rows.findIndex((row) => row.stockItemId === item.id);
      // Ayni parca ikinci kez okutulursa yeni satir acmak yerine adedi artir:
      // depoda barkod arka arkaya okutulur, bu en dogal davranis.
      if (existing >= 0) {
        toast.success(`${item.name} adedi artirildi.`);
        return rows.map((row, i) =>
          i === existing ? { ...row, quantity: row.quantity + quantity } : row,
        );
      }
      return [...rows, { stockItemId: item.id, label: labelFor(item), quantity, unitCost }];
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

  /**
   * Eslesmeyen satir icin arama: belgedeki metnin tamami ("160*200 Cotton
   * Master Yatak") karttaki adla birebir eslesmez. Olcu olmayan ilk anlamli
   * kelimeyle (genelde model adi) aranir; kutuda tam metin durur, kullanici
   * daraltabilir.
   */
  async function searchFor(text: string) {
    setQuery(text);
    const word = text
      .split(/[\s*×/.,-]+/)
      // "160x200" gibi olculer ve "Ad." atlanir; "CLIMEXTRA" bolunmesin diye x'e gore bolunmuyor.
      .find((part) => part.length >= 3 && !/^\d+(x\d+)?$/i.test(part) && !/^ad(et)?$/i.test(part));
    setResults(word ? await findStockItemsAction(word) : []);
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
        {/* Irsaliyeyi okuyup formu doldurur; stoga yazmaz. Kayit asagidaki
            dugmeyle, kullanici kontrol ettikten sonra. */}
        <div className="space-y-2 rounded-lg border border-dashed border-neutral-300 bg-white p-4">
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readDocument(file);
            }}
          />
          <Button
            type="button"
            className="h-11 gap-2"
            disabled={!aiEnabled || reading}
            onClick={() => fileInput.current?.click()}
          >
            <FileScan className="size-4" />
            {reading ? 'Belge okunuyor...' : 'Belgeden oku (yapay zeka)'}
          </Button>
          <p className="text-xs text-neutral-500">
            {aiEnabled
              ? 'Irsaliyenin fotografini ya da PDF\'ini secin; satirlar forma dolar. Stoga girmez — kontrol edip kaydedince girer.'
              : 'Yapay zeka ayarli degil: Vercel\'de OPENAI_API_KEY tanimlanmali.'}
          </p>
        </div>

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

          {unmatched.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900">
                Eslesmeyen satirlar — parcayi siz secin
              </p>
              <ul className="space-y-1.5">
                {unmatched.map((row) => (
                  <li key={row.key} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 text-amber-950">
                      {row.text} · <strong>{row.quantity} adet</strong>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      onClick={() => {
                        setResolving(row.key);
                        void searchFor(row.text);
                      }}
                    >
                      {resolving === row.key ? 'Asagidan secin' : 'Ara'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 text-red-600"
                      onClick={() => {
                        setUnmatched((rows) => rows.filter((other) => other.key !== row.key));
                        if (resolving === row.key) setResolving(null);
                      }}
                    >
                      Kaldir
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
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
                  <QuantityInput
                    value={row.quantity}
                    aria-label={`${row.label} adedi`}
                    onValueChange={(quantity) =>
                      setLines((rows) =>
                        rows.map((current, i) => (i === index ? { ...current, quantity } : current)),
                      )
                    }
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
