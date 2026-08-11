import { cookies } from 'next/headers';
import { db } from '@/db/client';
import { listLoginableBranches } from '@/domain/branches';
import { LAST_ACCOUNT_COOKIE } from '@/lib/auth/session';
import { LoginForm, type AccountOption } from './login-form';

// Sube adlari ve parola durumu veritabanindan geliyor; on-uretilmis bir giris
// ekrani yeni acilan subeyi gostermezdi.
export const dynamic = 'force-dynamic';

export default async function GirisPage() {
  const [branches, store] = await Promise.all([listLoginableBranches(db), cookies()]);

  const accounts: AccountOption[] = [
    ...branches.map((branch) => ({ id: branch.id, label: branch.name })),
    { id: 'admin', label: 'Yonetici' },
  ];

  // Parolasi belirlenmemis sube listede yok; hatirlanan hesap artik
  // secilemiyorsa ilk siradakine dusuyoruz.
  const remembered = store.get(LAST_ACCOUNT_COOKIE)?.value;
  const defaultAccount =
    remembered && accounts.some((account) => account.id === remembered)
      ? remembered
      : accounts[0].id;

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <LoginForm accounts={accounts} defaultAccount={defaultAccount} />
    </main>
  );
}
