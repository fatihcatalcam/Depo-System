'use client';

import {
  BarChart3,
  Boxes,
  ClipboardList,
  FolderTree,
  Home,
  MoreHorizontal,
  Package,
  PackagePlus,
  QrCode,
  Settings,
  Sheet,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

/** Mobil alt menude gorunen, en sik kullanilan islemler. */
const PRIMARY = [
  { href: '/', label: 'Ana sayfa', icon: Home },
  { href: '/stok', label: 'Stok', icon: Boxes },
  { href: '/siparisler', label: 'Siparis', icon: ClipboardList },
  { href: '/sevkiyat', label: 'Sevkiyat', icon: Truck },
] as const;

/** Masaustu yan menude ayrica gorunenler; mobilde "Diger" sayfasindan. */
const SECONDARY = [
  { href: '/mal-kabul', label: 'Mal kabul', icon: PackagePlus },
  { href: '/raporlar', label: 'Raporlar', icon: BarChart3 },
  { href: '/urunler', label: 'Urunler', icon: Package },
  { href: '/musteriler', label: 'Musteriler', icon: Users },
  { href: '/tedarikciler', label: 'Tedarikciler', icon: Warehouse },
  { href: '/kategoriler', label: 'Kategoriler', icon: FolderTree },
  { href: '/etiket', label: 'Barkod etiketi', icon: QrCode },
  { href: '/ayarlar', label: 'Ayarlar', icon: Settings },
] as const;

export const SECONDARY_LINKS = SECONDARY;

/**
 * Siparis ozeti yan menude siparislerin hemen altinda; dukkan Excel'deki
 * siparis listesine bakar gibi ona sik bakiyor. Mobil alt menude yer yok,
 * orada "Diger" sayfasinda.
 */
const ORDER_SUMMARY: NavItem = { href: '/siparisler/ozet', label: 'Siparis ozeti', icon: Sheet };

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/**
 * Birden fazla baglanti eslesebilir: /siparisler/ozet hem "Siparis" hem
 * "Siparis ozeti" ile basliyor. Yalnizca en uzun eslesen isaretlenir.
 */
function activeHref(pathname: string, hrefs: readonly string[]): string | undefined {
  return hrefs
    .filter((href) => isActive(pathname, href))
    .sort((a, b) => b.length - a.length)[0];
}

export function DesktopNav() {
  const pathname = usePathname();
  const items: NavItem[] = [
    ...PRIMARY.flatMap((item): NavItem[] =>
      item.href === '/siparisler' ? [item, ORDER_SUMMARY] : [item],
    ),
    ...SECONDARY,
  ];
  const active = activeHref(
    pathname,
    items.map((item) => item.href),
  );

  return (
    // Sayfayla birlikte kaymiyor: uzun bir listenin sonunda baska bir sayfaya
    // gecmek icin once en uste cikmak gerekmesin.
    <nav className="sticky top-0 hidden h-screen w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-3 md:block print:hidden">
      <div className="px-2 pb-4 pt-2 text-sm font-semibold text-neutral-900">Depo Sistemi</div>
      <ul className="space-y-1">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                href === active
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-700 hover:bg-neutral-100'
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const items = [...PRIMARY, { href: '/diger', label: 'Diger', icon: MoreHorizontal }] as const;

  return (
    // 64 piksel yukseklik bilincli: depo personeli telefonu ayakta,
    // elleri doluyken kullanacak.
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white md:hidden print:hidden">
      <ul className="grid grid-cols-5">
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] ${
                isActive(pathname, href) ? 'text-neutral-900' : 'text-neutral-500'
              }`}
            >
              <Icon className="size-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
