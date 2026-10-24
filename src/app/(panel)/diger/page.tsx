import {
  BarChart3,
  FolderTree,
  Package,
  PackagePlus,
  QrCode,
  Settings,
  Sheet,
  Users,
  Warehouse,
} from 'lucide-react';
import Link from 'next/link';
import { currentUser } from '@/lib/auth/current';

const LINKS = [
  {
    href: '/siparisler/ozet',
    label: 'Sipariş özeti',
    description: 'Excel listesi gibi: kim, ne, ne zaman, nereye ve ödeme',
    icon: Sheet,
  },
  {
    href: '/mal-kabul',
    label: 'Mal kabul',
    description: 'Fabrikadan gelen sevkiyatı stoğa işle',
    icon: PackagePlus,
  },
  {
    href: '/raporlar',
    label: 'Raporlar',
    description: 'Günlük, haftalık ve aylık özet',
    icon: BarChart3,
  },
  { href: '/urunler', label: 'Ürünler', description: 'Satılan setler ve reçeteleri', icon: Package },
  {
    href: '/musteriler',
    label: 'Müşteriler',
    description: 'Müşteri kayıtları ve adresleri',
    icon: Users,
  },
  {
    href: '/tedarikciler',
    label: 'Tedarikçiler',
    description: 'Mal kabulde seçilen fabrikalar',
    icon: Warehouse,
  },
  {
    href: '/kategoriler',
    label: 'Kategoriler',
    description: 'Ana ve alt kategori ağacı',
    icon: FolderTree,
  },
  {
    href: '/etiket',
    label: 'Barkod etiketi',
    description: 'Parçalar için yazdırılabilir etiket sayfası',
    icon: QrCode,
  },
  {
    href: '/ayarlar',
    label: 'Ayarlar',
    description: 'Firma bilgileri, parola, Excel aktarma',
    icon: Settings,
  },
] as const;

export default async function DigerPage() {
  const user = await currentUser();
  // Siparis ozeti yalnizca merkezde.
  const links = user.isCentral ? LINKS : LINKS.filter((link) => link.href !== '/siparisler/ozet');

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Diğer</h1>
      <ul className="space-y-2">
        {links.map(({ href, label, description, icon: Icon }) => (
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
