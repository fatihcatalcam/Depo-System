import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Props {
  branches: { code: string; name: string }[];
  /** Secili sube kodu; bos = tum subeler. */
  current: string | undefined;
  /** Sube secildiginde gidilecek adres; diger suzgecler (durum, arama, tarih) korunur. */
  hrefFor: (code: string | undefined) => string;
}

/**
 * Merkez icin sube secimi: "Tum subeler / Merkez / Sube 2". Sube kullanicisi
 * zaten yalnizca kendi siparislerini gordugu icin ona gosterilmez.
 */
export function BranchFilter({ branches, current, hrefFor }: Props) {
  const options = [{ code: undefined, name: 'Tüm şubeler' }, ...branches];
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Şube">
      <span className="text-xs font-medium uppercase text-neutral-500">Şube</span>
      {options.map((option) => (
        <Link
          key={option.code ?? 'hepsi'}
          href={hrefFor(option.code)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs',
            current === option.code
              ? 'border-blue-700 bg-blue-700 text-white'
              : 'border-neutral-300 bg-white text-neutral-600 hover:border-neutral-500',
          )}
        >
          {option.name}
        </Link>
      ))}
    </nav>
  );
}
