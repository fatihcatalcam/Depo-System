'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Satirin tamami siparisi acar; yalnizca numaraya tiklamak zorunda kalmamak
 * icin. Telefonda ince bir numarayi tutturmak, satirin herhangi bir yerine
 * dokunmaktan cok daha zor.
 *
 * Satirin icindeki gercek baglantilar (siparis numarasi) ve kontroller
 * (fabrika tiki, teslim tarihi) kendi isini yapar: Ctrl ile yeni sekmede
 * acmak orada hala calisiyor.
 */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={(event) => {
        // Satirin icindeki baglanti, dugme ve tarih alani kendi isini yapar.
        if ((event.target as HTMLElement).closest('a, button, input, select, textarea, label')) {
          return;
        }
        router.push(href);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.target === event.currentTarget) router.push(href);
      }}
      className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none"
    >
      {children}
    </tr>
  );
}
