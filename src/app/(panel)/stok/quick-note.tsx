'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { updateStockNoteAction } from './actions';

interface Props {
  stockItemId: string;
  stockItemName: string;
  note: string | null;
}

const MAX_LENGTH = 200;

/**
 * Stok listesinde satir ici not.
 *
 * Neden listede: notlar anlik ve siktir — "bu parca 2. subeye odunc verildi",
 * "bu partinin rengi biraz koyu". Kart acip duzenleyip kaydetmek depoda
 * telefonla calisan biri icin fazla yavas; yazilmayan not da hic yok demektir.
 *
 * Kutu her zaman ekranda. Once "not ekle" dugmesi gosterip tiklaninca kutuya
 * cevirmeyi denedik: dugme kaybolunca yeni kutunun odagi JavaScript'e kaliyor
 * ve mobilde tek dokunus iki dokunusa donusuyordu. Kutuyu bastan koymak hem
 * daha az durum hem daha az sey ters gidebilir.
 *
 * Kaydetme kutudan cikinca oluyor; Enter da kaydediyor, Escape vazgeciyor.
 */
export function QuickNote({ stockItemId, stockItemName, note }: Props) {
  const [text, setText] = useState(note ?? '');
  const [saved, setSaved] = useState(note ?? '');
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Baska bir yerden gelen guncelleme (ornegin kart duzenleme ekrani).
  // Kullanici yazarken uzerine yazmiyoruz.
  const lastProp = useRef(note);
  useEffect(() => {
    if (note === lastProp.current) return;
    lastProp.current = note;
    if (document.activeElement !== inputRef.current) {
      setText(note ?? '');
      setSaved(note ?? '');
    }
  }, [note]);

  /**
   * Metni React durumundan degil olaydan aliyoruz: durum guncellemesi
   * blur'dan sonraya kalirsa buradaki `text` eski degeri gosterir ve not
   * sessizce kaydedilmez.
   */
  async function commit(raw: string) {
    const next = raw.trim();
    if (next === saved) return;

    setPending(true);
    const result = await updateStockNoteAction(stockItemId, next);
    setPending(false);

    if (result.ok) {
      setSaved(next);
      setText(next);
      lastProp.current = next === '' ? null : next;
    } else {
      // Basarisizsa eski nota donuyoruz: ekranda kaydedilmis gibi duran bir
      // not, hic olmayan nottan daha yaniltici.
      setText(saved);
      toast.error(`${stockItemName}: ${result.error ?? 'Not kaydedilemedi.'}`);
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={text}
      maxLength={MAX_LENGTH}
      disabled={pending}
      onChange={(event) => setText(event.target.value)}
      onBlur={(event) => void commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          setText(saved);
          event.currentTarget.blur();
        }
      }}
      placeholder="Not ekle"
      aria-label={`${stockItemName} notu`}
      title={text || undefined}
      className="w-full rounded-md border border-transparent bg-transparent p-1.5 text-xs text-neutral-700 outline-none placeholder:text-neutral-300 hover:border-neutral-200 focus:border-neutral-900 focus:bg-white disabled:opacity-50"
    />
  );
}
