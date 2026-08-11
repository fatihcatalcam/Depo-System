import { logoutAction } from '@/app/giris/actions';
import { DesktopNav, MobileNav } from '@/components/app-nav';
import { currentUser } from '@/lib/auth/current';

/**
 * Panelin tamami canli veri gosterir: stok adetleri, rezervasyonlar, kategoriler.
 * Statik on-uretim bu rakamlari build aninda dondururdu — depo yazilimi icin
 * kabul edilemez. Tum alt rotalar istek aninda uretilir.
 */
export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();

  return (
    <div className="flex min-h-screen">
      <DesktopNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4">
          <span className="truncate text-sm font-semibold md:hidden">Depo Sistemi</span>
          <span className="hidden md:block" />
          <div className="flex items-center gap-3">
            {/* Hangi subede oldugu her ekranda gorunmeli: yanlis subeye
                siparis girmek, sonradan duzeltmesi en zor hatalardan. */}
            <span
              className={`truncate rounded-full px-2.5 py-1 text-xs font-medium ${
                user.isAdmin ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-700'
              }`}
            >
              {user.label}
            </span>
            <form action={logoutAction}>
              <button type="submit" className="text-sm text-neutral-500 hover:text-neutral-900">
                Cikis
              </button>
            </form>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 pb-24 md:pb-8">{children}</main>
      </div>
      <MobileNav />
    </div>
  );
}
