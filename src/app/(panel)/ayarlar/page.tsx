import { db } from '@/db/client';
import { listBranches } from '@/domain/branches';
import { countPaletteItems, listPalettes } from '@/domain/catalog/colors';
import { ensureSettings, getSettings } from '@/domain/settings';
import { currentUser } from '@/lib/auth/current';
import { isDemo } from '@/lib/demo';
import {
  BranchPanel,
  ColorPalettesPanel,
  CompanyPanel,
  ImportPanel,
  MaintenancePanel,
  PasswordPanel,
  UnlockPasswordPanel,
} from './settings-panels';

const EXPORTS = [
  { href: '/api/disa-aktar/stok', label: 'Stok listesi' },
  { href: '/api/disa-aktar/musteriler', label: 'Müşteri listesi' },
  { href: '/api/disa-aktar/siparisler', label: 'Siparişler ve alacaklar' },
];

export default async function AyarlarPage() {
  // Demoda firma bilgisi, parolalar ve Excel'den ice aktarma kapali; eylemler de reddediyor.
  const demo = isDemo();
  await ensureSettings(db, process.env.INITIAL_APP_PASSWORD ?? 'depo2026');
  const [settings, user, branches, palettes, paletteItems] = await Promise.all([
    getSettings(db),
    currentUser(),
    listBranches(db),
    listPalettes(db),
    countPaletteItems(db),
  ]);

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Ayarlar</h1>
        <p className="text-sm text-neutral-500">
          {user.label} olarak giriş yapıldı · firma bilgileri, parola ve veri aktarma
        </p>
      </div>

      {demo ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Demoda firma bilgisi, parolalar ve Excel&apos;den içe aktarma kapalı. Dışa aktarma ve
          renk kartelaları açık.
        </p>
      ) : (
        <>
          {user.isCentral ? <BranchPanel branches={branches} /> : null}

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

          {user.isCentral ? <UnlockPasswordPanel /> : null}
        </>
      )}

      {user.isCentral ? (
        <ColorPalettesPanel
          palettes={palettes.map((palette) => ({
            id: palette.id,
            name: palette.name,
            codes: palette.codes,
            itemCount: paletteItems.get(palette.id) ?? 0,
          }))}
        />
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-semibold">Excel&apos;e dışa aktarma</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Muhasebeciye göndermek veya yedek almak için.
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

      {demo ? null : <ImportPanel />}
      <MaintenancePanel />
    </div>
  );
}
