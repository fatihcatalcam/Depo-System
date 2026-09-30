'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * Satirin tamami siparisi acar; yalnizca numaraya tiklamak zorunda kalmamak
 * icin. Telefonda ince bir numarayi tutturmak, satirin herhangi bir yerine
 * dokunmaktan cok daha zor.
 *
 * Satirin icindeki gercek baglantilar (siparis numarasi) kendi isini yapar:
 * Ctrl ile yeni sekmede acmak orada hala calisiyor.
 */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a')) return;
        router.push(href);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') router.push(href);
      }}
      className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 focus-visible:bg-neutral-50 focus-visible:outline-none"
    >
      {children}
    </tr>
  );
}
