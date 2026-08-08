'use client';

import { Boxes, FolderTree, Home, Package } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/', label: 'Ana sayfa', icon: Home },
  { href: '/stok', label: 'Stok', icon: Boxes },
  { href: '/urunler', label: 'Urunler', icon: Package },
  { href: '/kategoriler', label: 'Kategori', icon: FolderTree },
] as const;

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden w-56 shrink-0 border-r border-neutral-200 bg-white p-3 md:block">
      <div className="px-2 pb-4 pt-2 text-sm font-semibold text-neutral-900">Depo Sistemi</div>
      <ul className="space-y-1">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                isActive(pathname, href)
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

  return (
    // 64 piksel yukseklik bilincli: depo personeli telefonu ayakta,
    // elleri doluyken kullanacak.
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white md:hidden">
      <ul className="grid grid-cols-4">
        {ITEMS.map(({ href, label, icon: Icon }) => (
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
