import { FolderTree, Package, QrCode, Users, Warehouse } from 'lucide-react';
import Link from 'next/link';

const LINKS = [
  { href: '/urunler', label: 'Urunler', description: 'Satilan setler ve receteleri', icon: Package },
  {
    href: '/musteriler',
    label: 'Musteriler',
    description: 'Musteri kayitlari ve adresleri',
    icon: Users,
  },
  {
    href: '/tedarikciler',
    label: 'Tedarikciler',
    description: 'Mal kabulde secilen fabrikalar',
    icon: Warehouse,
  },
  {
    href: '/kategoriler',
    label: 'Kategoriler',
    description: 'Ana ve alt kategori agaci',
    icon: FolderTree,
  },
  {
    href: '/etiket',
    label: 'Barkod etiketi',
    description: 'Parcalar icin yazdirilabilir etiket sayfasi',
    icon: QrCode,
  },
] as const;

export default function DigerPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Diger</h1>
      <ul className="space-y-2">
        {LINKS.map(({ href, label, description, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-400"
            >
              <Icon className="size-5 shrink-0 text-neutral-500" />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-neutral-500">{description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
