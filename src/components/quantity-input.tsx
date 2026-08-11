'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
  'aria-label'?: string;
}

/**
 * Adet kutusu.
 *
 * Neden ayri bir bilesen: `value={n}` + `onChange={Math.max(1, Number(...))}`
 * kalibi kutunun bosaltilmasini imkansiz kiliyor. Icerideki "1" silinemiyor,
 * kullanici "2" yazinca "12" oluyor. Masaustunde ok tuslariyla idare
 * edilebiliyor ama telefonda hicbir cikis yolu yok.
 *
 * Cozumun uc parcasi var:
 *  - Yazarken metin oldugu gibi tutuluyor; kutu bos birakilabiliyor. Sayiya
 *    cevirme ve sinirlara oturtma kutudan cikilinca yapiliyor.
 *  - Kutuya dokununca mevcut deger seciliyor, tek dokunusla ustune yaziliyor.
 *  - `type="number"` yerine `inputMode="numeric"`: numara klavyesi yine
 *    aciliyor ama sayi kutulari secim API'sini (select/selectionStart)
 *    desteklemedigi icin "dokun ve ustune yaz" orada calismiyordu. Kaybolan
 *    yukari/asagi oklarini asagida elle karsiliyoruz.
 */
export function QuantityInput({
  value,
  onValueChange,
  min = 1,
  max,
  className,
  'aria-label': ariaLabel,
}: Props) {
  const [text, setText] = useState(String(value));
  // Kendi bildirdigimiz degeri burada tutuyoruz ki disaridan gelen bir
  // degisiklik ile kullanicinin yazdigi metin birbirini ezmesin.
  const knownValue = useRef(value);

  useEffect(() => {
    if (value === knownValue.current) return;
    knownValue.current = value;
    setText(String(value));
  }, [value]);

  function clamp(next: number): number {
    const floored = Math.max(min, Math.trunc(next));
    return max === undefined ? floored : Math.min(max, floored);
  }

  function publish(next: number) {
    if (next === knownValue.current) return;
    knownValue.current = next;
    onValueChange(next);
  }

  /** Kutudan cikarken: bos ya da bozuk girdiyi gecerli bir sayiya oturt. */
  function commit(raw: string) {
    const parsed = Number(raw);
    const next = raw.trim() === '' || !Number.isFinite(parsed) ? min : clamp(parsed);
    setText(String(next));
    publish(next);
  }

  function step(delta: number) {
    const parsed = Number(text);
    const base = text.trim() === '' || !Number.isFinite(parsed) ? min : parsed;
    const next = clamp(base + delta);
    setText(String(next));
    publish(next);
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={text}
      aria-label={ariaLabel}
      className={cn('h-10 w-20 text-center', className)}
      onFocus={(event) => event.target.select()}
      onChange={(event) => {
        // Yalnizca rakam kabul ediyoruz; bos kalmasina izin var.
        const raw = event.target.value.replace(/[^\d]/g, '');
        setText(raw);
        if (raw === '') return;
        publish(clamp(Number(raw)));
      }}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          step(1);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          step(-1);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          commit(event.currentTarget.value);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
