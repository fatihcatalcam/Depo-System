'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/client';
import { login } from '@/domain/auth';
import { listBranches } from '@/domain/branches';
import { assertDemo } from '@/domain/demo/guard';
import { ensureSettings } from '@/domain/settings';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
} from '@/lib/auth/session';

const schema = z.object({
  password: z.string().min(1, 'Parola girin.'),
});

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ password: formData.get('password') });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Ilk acilista ayar satirini ve kilit parolasini olusturur.
  await ensureSettings(db, process.env.INITIAL_APP_PASSWORD ?? 'depo2026');

  // Parola hangi subeninse o sube acilir; sube secimi yok.
  const result = await login(db, parsed.data.password);

  if (!result.ok) {
    return {
      error: result.lockedMinutes
        ? `Çok fazla hatalı deneme. ${result.lockedMinutes} dakika sonra tekrar deneyin.`
        : 'Parola hatalı.',
    };
  }

  await startSession(result.scope.branchId);
  redirect('/');
}

async function startSession(branchId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken({ role: 'branch', branchId }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/**
 * Demoda parolasiz giris: "Merkez olarak gir" / "Sube 2 olarak gir".
 *
 * Sube kodu formdan geliyor ama yetki ondan dogmuyor: `assertDemo` hem
 * demo bayragina hem veritabaninin adina bakiyor. Canli sistemde bu eylem
 * cagrilsa bile kimseyi iceri almaz.
 */
export async function demoLoginAction(formData: FormData): Promise<void> {
  await assertDemo(db);

  const code = formData.get('branch');
  const branch = (await listBranches(db)).find((row) => row.code === code && row.isActive);
  if (!branch) redirect('/giris');

  await startSession(branch.id);
  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/giris');
}
