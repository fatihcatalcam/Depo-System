import { DEMO_CONTACT_URL, isDemo } from '@/lib/demo';

/**
 * Demonun her sayfanin ustundeki ince seridi. Ziyaretci gercek bir isletmenin
 * verisine baktigini sanmasin, girdigi verinin kalici olmadigini bilsin.
 * Yazdirilan kagitlara cikmaz.
 */
export function DemoBanner() {
  if (!isDemo()) return null;

  return (
    <div className="bg-amber-300 px-4 py-1 text-center text-xs font-medium text-amber-950 print:hidden">
      DEMO · Veriler her gece sıfırlanır · Kendi işletmen için{' '}
      <a href={DEMO_CONTACT_URL} target="_blank" rel="noopener" className="font-semibold underline">
        @catalcamyazilim
      </a>
    </div>
  );
}
