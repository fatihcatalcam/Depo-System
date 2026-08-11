'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/client';
import { authenticate, type Account } from '@/domain/auth';
import { ensureSettings } from '@/domain/settings';
import {
  LAST_ACCOUNT_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
} from '@/lib/auth/session';

const schema = z.object({
  /** 'admin' ya da bir sube kimligi. */
  account: z.string().min(1, 'Hesap secin.'),
  password: z.string().min(1, 'Parola girin.'),
});

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    account: formData.get('account'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Ilk acilista ayar satirini ve yonetici parolasini olusturur.
  await ensureSettings(db, process.env.INITIAL_APP_PASSWORD ?? 'depo2026');

  const { account: accountId, password } = parsed.data;

  let account: Account;
  if (accountId === 'admin') {
    account = { kind: 'admin' };
  } else if (z.uuid().safeParse(accountId).success) {
    account = { kind: 'branch', branchId: accountId };
  } else {
    return { error: 'Hesap secin.' };
  }

  const result = await authenticate(db, account, password);

  if (!result.ok) {
    return {
      error: result.lockedMinutes
        ? `Cok fazla hatali deneme. ${result.lockedMinutes} dakika sonra tekrar deneyin.`
        : 'Parola hatali.',
    };
  }

  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    await createSessionToken(
      account.kind === 'admin' ? { role: 'admin' } : { role: 'branch', branchId: account.branchId },
    ),
    {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  );

  // Ayni kisi hep ayni hesaba giriyor; secimi hatirlayip bir dokunus
  // kazandiriyoruz. Gizli bir bilgi degil, httpOnly olmasi gerekmiyor.
  store.set(LAST_ACCOUNT_COOKIE, accountId, {
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
