import { db } from '@/db/client';
import { getSettings } from '@/domain/settings';

/** Firma anteni. Ayarlardan gelir, her yazdirma ciktisinin ustunde durur. */
export async function PrintHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  let company = { companyName: '', address: null as string | null, phone: null as string | null };
  try {
    const settings = await getSettings(db);
    company = {
      companyName: settings.companyName,
      address: settings.address,
      phone: settings.phone,
    };
  } catch {
    // Ayarlar henuz kurulmamissa antetsiz basariz, cikti yine de alinsin.
  }

  return (
    <header className="mb-4 border-b-2 border-neutral-900 pb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-bold">{company.companyName || 'Depo Sistemi'}</div>
          {company.address ? (
            <div className="text-xs text-neutral-600">{company.address}</div>
          ) : null}
          {company.phone ? <div className="text-xs text-neutral-600">{company.phone}</div> : null}
        </div>
        <div className="text-right">
          <div className="text-base font-bold">{title}</div>
          {subtitle ? <div className="text-xs text-neutral-600">{subtitle}</div> : null}
        </div>
      </div>
    </header>
  );
}
