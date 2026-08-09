import { db } from '@/db/client';
import { ensureSettings, getSettings } from '@/domain/settings';
import {
  CompanyPanel,
  ImportPanel,
  MaintenancePanel,
  PasswordPanel,
} from './settings-panels';

const EXPORTS = [
  { href: '/api/disa-aktar/stok', label: 'Stok listesi' },
  { href: '/api/disa-aktar/musteriler', label: 'Musteri listesi' },
  { href: '/api/disa-aktar/siparisler', label: 'Siparisler ve alacaklar' },
];

export default async function AyarlarPage() {
  await ensureSettings(db, process.env.INITIAL_APP_PASSWORD ?? 'depo2026');
  const settings = await getSettings(db);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Ayarlar</h1>
        <p className="text-sm text-neutral-500">Firma bilgileri, parola ve veri aktarma</p>
      </div>

      <CompanyPanel
        initial={{
          companyName: settings.companyName,
          address: settings.address ?? '',
          phone: settings.phone ?? '',
          email: settings.email ?? '',
          taxInfo: settings.taxInfo ?? '',
        }}
      />

      <PasswordPanel />

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Excel&apos;e disa aktarma</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Muhasebeciye gondermek veya yedek almak icin.
        </p>
        <div className="flex flex-wrap gap-2">
          {EXPORTS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="h-11 rounded-md border border-neutral-300 px-4 py-2.5 text-sm hover:border-neutral-500"
            >
              {item.label}
            </a>
          ))}
        </div>
      </section>

      <ImportPanel />
      <MaintenancePanel />
    </div>
  );
}
