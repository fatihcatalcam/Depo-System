'use client';

import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Fragment, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  colorsInStock,
  PART_KINDS,
  PART_LABELS,
  partsOf,
  stockTone,
  totalOnHand,
  totalReserved,
  type GridItem,
  type GridPart,
  type GridSet,
  type StockGrid,
  type StockTone,
} from './grid';
import { QuickAdjust } from './quick-adjust';
import { QuickNote } from './quick-note';

/**
 * Dukkanin Excel'indeki renkler: 0 kirmizi, 1 sari, 2+ yesil. Soluk degil:
 * uzaktan, telefon ekraninda bir bakista secilebilmeli.
 */
const TONE: Record<StockTone, string> = {
  empty: 'bg-red-200 text-red-900',
  low: 'bg-yellow-200 text-yellow-900',
  ok: 'bg-green-300 text-green-950',
};

/** Olcu | Yatak | Baza | Baslik | Set */
const COLUMNS =
  'grid grid-cols-[minmax(0,1fr)_repeat(3,3.5rem)_2.75rem] gap-1.5 sm:grid-cols-[minmax(0,1fr)_repeat(3,5rem)_4rem] sm:gap-2';

interface Props {
  grid: StockGrid;
  locked: boolean;
}

/**
 * Stok ekrani, Excel duzeninde: model basligi, altinda olculer; her olcude
 * yatak, baza, baslik yan yana ve en sagda kac takim ciktigi.
 *
 * Satira dokununca altinda uc parcanin +/- ve not alanlari acilir. Listede
 * her satira dugme koymak, dar ekranda sayilari okunmaz hale getirirdi.
 */
export function StockGridView({ grid, locked }: Props) {
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const models = onlyInStock
    ? grid.models
        .map((model) => ({
          ...model,
          sets: model.sets.filter((set) => partsOf(set).some((part) => totalOnHand(part.item) !== 0)),
        }))
        .filter((model) => model.sets.length > 0)
    : grid.models;
  const others = onlyInStock ? grid.others.filter((item) => totalOnHand(item) !== 0) : grid.others;

  function toggle(key: string) {
    setOpenRow((current) => (current === key ? null : key));
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 px-1 text-base text-neutral-700">
        <input
          type="checkbox"
          checked={onlyInStock}
          onChange={(event) => setOnlyInStock(event.target.checked)}
          className="size-5 accent-neutral-900"
        />
        Sadece stogu olanlar
      </label>

      {models.length > 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white">
          {/* Sutun basliklari kayarken ustte kalir: 180 satirin ortasinda
              hangi sutunun baza oldugunu hatirlamak zorunda kalinmasin. */}
          <div
            className={cn(
              COLUMNS,
              'sticky top-0 z-10 rounded-t-lg border-b border-neutral-200 bg-neutral-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-600 sm:px-3 sm:text-sm',
            )}
          >
            <span className="text-left">Olcu</span>
            {PART_KINDS.map((kind) => (
              <span key={kind}>{PART_LABELS[kind]}</span>
            ))}
            <span>Set</span>
          </div>

          {models.map((model) => (
            <section key={model.model} className="border-b border-neutral-200 last:border-0">
              <h2 className="bg-neutral-100/70 px-3 py-2 text-lg font-bold text-neutral-900">
                {model.model}
              </h2>
              <div className="divide-y divide-neutral-100">
                {model.sets.map((set) => (
                  <Fragment key={set.productId}>
                    <SetRow
                      set={set}
                      open={openRow === set.productId}
                      onToggle={() => toggle(set.productId)}
                    />
                    {openRow === set.productId ? (
                      <Editor parts={partsOf(set)} locked={locked} />
                    ) : null}
                  </Fragment>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {others.length > 0 ? (
        <div className="rounded-lg border border-neutral-200 bg-white">
          <h2 className="rounded-t-lg border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-lg font-bold text-neutral-900">
            Diger urunler
          </h2>
          <div className="divide-y divide-neutral-100">
            {others.map((item) => (
              <Fragment key={item.id}>
                <OtherRow
                  item={item}
                  open={openRow === item.id}
                  onToggle={() => toggle(item.id)}
                />
                {openRow === item.id ? (
                  <Editor parts={[{ item, perSet: 1 }]} locked={locked} />
                ) : null}
              </Fragment>
            ))}
          </div>
        </div>
      ) : null}

      {models.length === 0 && others.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-center text-base text-neutral-500">
          {onlyInStock ? 'Stogu olan parca yok.' : 'Kayit bulunamadi.'}
        </p>
      ) : null}
    </div>
  );
}

function SetRow({ set, open, onToggle }: { set: GridSet; open: boolean; onToggle: () => void }) {
  const notes = partsOf(set)
    .map((part) => part.item.notes)
    .filter((note): note is string => Boolean(note));

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        COLUMNS,
        'w-full items-center px-2 py-1.5 text-left hover:bg-neutral-50 sm:px-3',
        open && 'bg-neutral-50',
      )}
    >
      <span className="min-w-0">
        <span className="block text-base font-semibold tabular-nums text-neutral-900">
          {set.size}
        </span>
        {/* Notlar Excel'deki "musteri ismi / notlar" sutunu: kimin icin
            ayrildigi burada yaziyor, gizlenmemeli. */}
        {notes.length > 0 ? (
          <span className="block truncate text-xs text-neutral-600">{notes.join(' · ')}</span>
        ) : null}
      </span>
      {PART_KINDS.map((kind) => (
        <QuantityCell key={kind} part={set.parts[kind]} />
      ))}
      <span
        className={cn(
          'text-center text-lg font-bold tabular-nums',
          set.setCount ? 'text-neutral-900' : 'text-neutral-300',
        )}
      >
        {set.setCount ?? '—'}
      </span>
    </button>
  );
}

function OtherRow({
  item,
  open,
  onToggle,
}: {
  item: GridItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-neutral-50',
        open && 'bg-neutral-50',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium text-neutral-900">{item.name}</span>
        {item.sizeLabel || item.notes ? (
          <span className="block truncate text-xs text-neutral-600">
            {[item.sizeLabel, item.notes].filter(Boolean).join(' · ')}
          </span>
        ) : null}
      </span>
      <span className="w-14 shrink-0 sm:w-20">
        <QuantityCell part={{ item, perSet: 1 }} />
      </span>
    </button>
  );
}

function QuantityCell({ part }: { part: GridPart | null }) {
  if (!part) {
    // Bu takimin bu parcasi katalogda yok; sifirla karismasin diye cizgi.
    return <span className="text-center text-lg text-neutral-300">—</span>;
  }
  const onHand = totalOnHand(part.item);
  const reserved = totalReserved(part.item);
  const colored = colorsInStock(part.item);

  return (
    <span
      className={cn(
        'flex h-12 flex-col items-center justify-center rounded-md',
        TONE[stockTone(onHand)],
      )}
    >
      <span className="text-lg font-bold leading-none tabular-nums">{onHand}</span>
      {/* Rezerve: siparise ayrilmis. Renk ve set sayisi fiziksel adetten;
          ayrilmis olan ayrica burada gorunuyor. */}
      {reserved > 0 ? (
        <span className="mt-1 text-[11px] font-semibold leading-none">{reserved} rez.</span>
      ) : colored > 0 ? (
        // Sayi standart + renklerin toplami; kac rengi oldugu satiri acinca gorunur.
        <span className="mt-1 text-[11px] font-semibold leading-none">{colored} renk</span>
      ) : null}
    </span>
  );
}

function Editor({ parts, locked }: { parts: GridPart[]; locked: boolean }) {
  return (
    <div className="grid gap-2 bg-neutral-50 px-3 pb-3 pt-1 sm:grid-cols-3">
      {parts.map(({ item }) => (
        <div key={item.id} className="space-y-1.5 rounded-md border border-neutral-200 bg-white p-2">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/stok/${item.id}`}
              className="min-w-0 text-sm font-medium text-neutral-800 hover:underline"
            >
              {item.name}
              {item.sizeLabel ? (
                <span className="block text-xs text-neutral-500">{item.sizeLabel}</span>
              ) : null}
            </Link>
            <div className="flex shrink-0 flex-col items-end">
              {/* Renkli kalemde ustteki +/- renksiz olani degistirir. */}
              {item.colors && item.colors.length > 0 ? (
                <span className="text-[11px] font-medium text-neutral-500">Standart</span>
              ) : null}
              <QuickAdjust
                target={{ stockItemId: item.id }}
                stockItemName={item.name}
                onHand={item.onHand}
                locked={locked}
              />
            </div>
          </div>
          {item.colors && item.colors.length > 0 ? (
            <ColorList item={item} locked={locked} />
          ) : null}
          <QuickNote stockItemId={item.id} stockItemName={item.name} note={item.notes} locked={locked} />
        </div>
      ))}
    </div>
  );
}

/**
 * Renk renk adet: kartelanin her kodu kendi adediyle ve +/- ile. Stogu olan renk varsa acik gelir,
 * yoksa kapali: 13 satirlik bos liste her acilista ekrani doldurmasin.
 */
function ColorList({ item, locked }: { item: GridItem; locked: boolean }) {
  const colors = item.colors ?? [];
  const inStock = colorsInStock(item);
  const [open, setOpen] = useState(inStock > 0);
  const colorTotal = colors.reduce((sum, color) => sum + (color.item?.onHand ?? 0), 0);

  return (
    <div className="rounded-md border border-neutral-200">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-50"
      >
        <span>
          Renkler{' '}
          <span className="text-xs font-normal text-neutral-500">
            ({colors.length} renk{colorTotal !== 0 ? ` · ${colorTotal} adet` : ''})
          </span>
        </span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-200">
          {colors.map((color) => {
            const onHand = color.item?.onHand ?? 0;
            const reserved = color.item?.reserved ?? 0;
            return (
              <li key={color.code} className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 font-semibold tabular-nums',
                      onHand !== 0 ? TONE[stockTone(onHand)] : 'text-neutral-700',
                    )}
                  >
                    {color.code}
                  </span>
                  {reserved > 0 ? (
                    <span className="text-[11px] font-semibold text-neutral-500">
                      {reserved} rez.
                    </span>
                  ) : null}
                </span>
                <QuickAdjust
                  target={{ baseStockItemId: item.id, code: color.code }}
                  stockItemName={`${item.name}${item.sizeLabel ? ` ${item.sizeLabel}` : ''} ${color.code}`}
                  onHand={onHand}
                  locked={locked}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
