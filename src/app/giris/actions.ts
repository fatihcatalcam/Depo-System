'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/client';
import { attemptLogin, ensureSettings } from '@/domain/settings';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken } from '@/lib/auth/session';

const schema = z.object({ password: z.string().min(1, 'Parola girin.') });

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({ password: formData.get('password') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Ilk acilista ayar satirini ve baslangic parolasini olusturur.
  await ensureSettings(db, process.env.INITIAL_APP_PASSWORD ?? 'depo2026');

  const result = await attemptLogin(db, parsed.data.password);

  if (!result.ok) {
    return {
      error: result.lockedMinutes
        ? `Cok fazla hatali deneme. ${result.lockedMinutes} dakika sonra tekrar deneyin.`
        : 'Parola hatali.',
    };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect('/');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/giris');
}
