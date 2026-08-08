import { logoutAction } from '@/app/giris/actions';
import { DesktopNav, MobileNav } from '@/components/app-nav';

/**
 * Panelin tamami canli veri gosterir: stok adetleri, rezervasyonlar, kategoriler.
 * Statik on-uretim bu rakamlari build aninda dondururdu — depo yazilimi icin
 * kabul edilemez. Tum alt rotalar istek aninda uretilir.
 */
export const dynamic = 'force-dynamic';

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <DesktopNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4">
          <span className="text-sm font-semibold md:hidden">Depo Sistemi</span>
          <span className="hidden md:block" />
          <form action={logoutAction}>
            <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-900">
              Cikis
            </button>
          </form>
        </header>
        <main className="min-w-0 flex-1 p-4 pb-24 md:pb-8">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
