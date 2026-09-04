'use client';

import { Minus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { quickAdjustStockAction } from './actions';

interface Props {
  stockItemId: string;
  stockItemName: string;
  onHand: number;
  /** Stok kilidi acikken dugmeler calismaz. Sunucu da ayrica kontrol eder. */
  locked: boolean;
}

/** Son dokunustan sonra sunucuya yazmadan once beklenen sure. */
const FLUSH_DELAY_MS = 500;

/**
 * Listeden tek dokunusla stok artirma / azaltma.
 *
 * Her dokunus sunucuya ayri gitmiyor: dokunuslar biriktiriliyor ve son
 * dokunustan yarim saniye sonra tek istek olarak yaziliyor. Depoda telefonla
 * ard arda basan biri icin fark buyuk — butonlar hicbir zaman kilitlenmiyor ve
 * on tiklama tek satirlik "+10" hareketi olarak deftere geciyor.
 *
 * Ekrandaki sayi = sunucunun dogruladigi bakiye + henuz yazilmamis dokunuslar.
 * Yazma basarisiz olursa (ornegin stok eksiye duserse) sadece o dokunuslar
 * geri alinir.
 */
export function QuickAdjust({ stockItemId, stockItemName, onHand, locked }: Props) {
  // Sunucunun dogruladigi son bakiye. `onHand` prop'u router.refresh()
  // tamamlanana kadar eski kalir; onay gelir gelmez buraya yaziyoruz ki sayi
  // once dusup sonra geri zipllamasin.
  const [serverValue, setServerValue] = useState(onHand);
  // Tiklandi, henuz sunucu tarafindan onaylanmadi.
  const [queued, setQueued] = useState(0);

  const queuedRef = useRef(0);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPropRef = useRef(onHand);
  const router = useRouter();

  function schedule() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), FLUSH_DELAY_MS);
  }

  async function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (queuedRef.current === 0) return;
    // Iki istek ayni anda giderse hangisinin sonucunun son geldigi belirsiz
    // olur; siradakini bekletiyoruz.
    if (inFlightRef.current) {
      schedule();
      return;
    }

    const amount = queuedRef.current;
    queuedRef.current = 0;
    inFlightRef.current = true;

    try {
      const result = await quickAdjustStockAction(stockItemId, amount);

      if (result.ok && result.onHand !== undefined) {
        // Iki guncelleme ayni render'da birlesir, boylece gorunen sayi
        // (serverValue + queued) hic degismez.
        setServerValue(result.onHand);
        setQueued((current) => current - amount);
        router.refresh();
      } else {
        setQueued((current) => current - amount);
        toast.error(`${stockItemName}: ${result.error ?? 'Islem basarisiz.'}`);
      }
    } finally {
      inFlightRef.current = false;
    }

    if (queuedRef.current !== 0) schedule();
  }

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  // Bekleyen dokunuslari kaybetmeyelim: yarim saniye dolmadan sayfadan cikan
  // ya da telefonu kilitleyen birinin girdigi adet ucmamali.
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') void flushRef.current();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void flushRef.current();
    };
  }, []);

  // Baska bir yerden (mal kabul, teslimat) gelen guncel veriyi benimse — ama
  // yalnizca kendi yazmamiz beklemiyorsa, yoksa eski sayiyi geri koyariz.
  useEffect(() => {
    if (onHand === lastPropRef.current) return;
    lastPropRef.current = onHand;
    if (queuedRef.current === 0 && !inFlightRef.current) setServerValue(onHand);
  }, [onHand]);

  function adjust(delta: number) {
    queuedRef.current += delta;
    setQueued((current) => current + delta);
    schedule();
  }

  const displayed = serverValue + queued;
  const unsaved = queued !== 0;

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        aria-label={`${stockItemName} stogunu bir azalt`}
        disabled={locked || displayed <= 0}
        onClick={() => adjust(-1)}
        className="flex size-9 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 hover:border-neutral-500 active:bg-neutral-100 disabled:opacity-40"
      >
        <Minus className="size-4" />
      </button>
      <span
        aria-live="polite"
        title={unsaved ? 'Kaydediliyor...' : undefined}
        className={`w-8 rounded text-center text-base font-semibold tabular-nums ${
          unsaved ? 'bg-amber-50 text-amber-700' : ''
        }`}
      >
        {displayed}
      </span>
      <button
        type="button"
        aria-label={`${stockItemName} stogunu bir artir`}
        disabled={locked}
        onClick={() => adjust(1)}
        className="flex size-9 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 hover:border-neutral-500 active:bg-neutral-100"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
