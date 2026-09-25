'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { groupStockItems, sizeLabelOf, type StockGroup, type StockListItem } from './grouping';
import { QuickAdjust } from './quick-adjust';
import { QuickNote } from './quick-note';

interface Props {
  items: StockListItem[];
  locked: boolean;
  /**
   * Arama ya da kategori secimi varken gruplar acik baslar: birkac sonuc icin
   * ayrica tiklatmak gereksiz.
   */
  defaultOpen: boolean;
}

/**
 * Stok listesi.
 *
 * Duz tablo yerine model -> boyut duzeni. Uc sebeple:
 *
 * 1. Ayni model adi on satir boyunca tekrar ediyordu; goz her satirda ayni
 *    metni bastan okuyordu. Model artik bir kez yaziliyor.
 * 2. Satir basina uc sayi vardi (mevcut / rezerve / serbest). Rezerve yoksa
 *    mevcut ile serbest ayni sey demek. Artik tek sayi var; rezerve varsa
 *    ayrica yaziliyor.
 * 3. Tablo 820 piksel genislik istiyordu, telefonda yan yana kaydirmak
 *    gerekiyordu. Bu duzen dar ekrana siginiyor.
 *
 * Kapali grup basliginda yalnizca **stogu olan** boyutlar ozetleniyor, boylece
 * "neyimiz var" sorusu hicbir sey acmadan cevaplaniyor. Sifirlar grup acilinca
 * gorunuyor; gizlenmis degil, one cikmiyor.
 */
export function StockList({ items, locked, defaultOpen }: Props) {
  const [expandAll, setExpandAll] = useState(defaultOpen);
  // Kullanicinin tek tek actiklari; "hepsini ac/kapat" bunlari sifirlar.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [onlyInStock, setOnlyInStock] = useState(false);

  const groups = groupStockItems(items);
  const shown = onlyInStock ? groups.filter((group) => group.onHand !== 0) : groups;

  const isOpen = (group: StockGroup) => toggled[group.name] ?? expandAll;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1 text-sm">
        {/*
          Bu iki secim adrese yazilmiyor: filtre degil, bakis acisi. Aramanin
          aksine baskasina gonderilecek bir sey degil.
        */}
        <label className="flex items-center gap-2 text-neutral-600">
          <input
            type="checkbox"
            checked={onlyInStock}
            onChange={(event) => setOnlyInStock(event.target.checked)}
            className="size-4 accent-neutral-900"
          />
          Sadece stogu olanlar
        </label>
        <button
          type="button"
          onClick={() => {
            setExpandAll((current) => !current);
            setToggled({});
          }}
          className="text-neutral-500 hover:text-neutral-900"
        >
          {expandAll ? 'Hepsini kapat' : 'Hepsini ac'}
        </button>
      </div>

      <div className="divide-y divide-neutral-100 overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {shown.map((group) =>
          group.items.length === 1 ? (
            <SingleRow key={group.name} group={group} locked={locked} />
          ) : (
            <Group
              key={group.name}
              group={group}
              open={isOpen(group)}
              onToggle={() =>
                setToggled((current) => ({ ...current, [group.name]: !isOpen(group) }))
              }
              locked={locked}
            />
          ),
        )}

        {shown.length === 0 ? (
          <p className="p-6 text-center text-sm text-neutral-500">
            {groups.length === 0 ? 'Kayit bulunamadi.' : 'Stogu olan parca yok.'}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Group({
  group,
  open,
  onToggle,
  locked,
}: {
  group: StockGroup;
  open: boolean;
  onToggle: () => void;
  locked: boolean;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-neutral-50"
      >
        <ChevronRight
          className={`size-4 shrink-0 text-neutral-400 transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-neutral-900">{group.name}</span>
          <span className="block truncate text-xs text-neutral-500">
            {open || group.inStock.length === 0
              ? `${group.items.length} boyut`
              : group.inStock.map((item) => `${sizeLabelOf(item)}: ${item.onHand}`).join('  ·  ')}
          </span>
        </span>
        <GroupTotal group={group} />
      </button>

      {/*
        Kapali grup hic cizilmiyor: 567 satirin tamamini DOM'da tutmak sayfayi
        agirlastirir, ustelik gizledigimiz seyi gizlemis olmaz.
      */}
      {open ? (
        <div className="divide-y divide-neutral-100 border-t border-neutral-100 bg-neutral-50/50">
          {group.items.map((item) => (
            <Row key={item.id} item={item} label={sizeLabelOf(item)} locked={locked} indented />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Tek boyutu olan model: grup kurmanin anlami yok, dogrudan satir. */
function SingleRow({ group, locked }: { group: StockGroup; locked: boolean }) {
  const [item] = group.items;

  return (
    <Row
      item={item}
      label={group.name}
      sublabel={item.sizeLabel?.trim() || undefined}
      locked={locked}
      indented={false}
    />
  );
}

function Row({
  item,
  label,
  sublabel,
  locked,
  indented,
}: {
  item: StockListItem;
  label: string;
  sublabel?: string;
  locked: boolean;
  indented: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pr-2 ${
        indented ? 'pl-9' : 'pl-3'
      }`}
    >
      <Link
        href={`/stok/${item.id}`}
        className="min-w-0 py-1 text-sm text-neutral-700 hover:underline"
      >
        <span className="block truncate">{label}</span>
        {sublabel ? (
          <span className="block truncate text-xs text-neutral-400">{sublabel}</span>
        ) : null}
      </Link>

      {/*
        Rezerve yalnizca varken yaziliyor. Her satira bos yere "0" basmak,
        listeyi yoran seyin ta kendisiydi.
      */}
      {item.reserved > 0 ? (
        <span
          className={`shrink-0 whitespace-nowrap text-xs ${
            item.isBelowMinimum ? 'text-red-600' : 'text-amber-700'
          }`}
        >
          {item.reserved} rezerve · {item.available} serbest
        </span>
      ) : null}

      {/*
        Not kutusu boyut satirinda, model satirinda degil. Sebebi: not bir
        boyuta ait ("160x200 siparis bekliyor"), ustelik 567 parcanin 8'inde
        not var — 60 tek boyutlu modelin her birine bos kutu koymak, listeden
        temizledigimiz gurultuyu geri getirir. Tek boyutlu modelin notu kart
        sayfasindan yazilir, varsa burada okunur.

        Kutu kendi satirina inmiyor: acik grupta on boyut varsa yirmi satir
        olur ve boyutlari tarayan goz yine yoruluyor.
      */}
      {indented ? (
        <div className="min-w-24 flex-1">
          <QuickNote
            stockItemId={item.id}
            stockItemName={item.name}
            note={item.notes}
            locked={locked}
          />
        </div>
      ) : item.notes ? (
        <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">{item.notes}</span>
      ) : null}

      <div className="ml-auto shrink-0">
        <QuickAdjust
          stockItemId={item.id}
          stockItemName={item.name}
          onHand={item.onHand}
          locked={locked}
        />
      </div>
    </div>
  );
}

/** Sifir soluk, dolu koyu: goz stogu olan modellere kendiliginden gidiyor. */
function GroupTotal({ group }: { group: StockGroup }) {
  return (
    <span
      className={`shrink-0 tabular-nums ${
        group.onHand === 0 ? 'text-sm text-neutral-300' : 'text-base font-semibold text-neutral-900'
      }`}
    >
      {group.onHand}
    </span>
  );
}
