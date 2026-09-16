'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from './actions';

const initialState: LoginState = {};

/**
 * Giris ekraninda tek alan var: parola.
 *
 * Sube dugmeleri kaldirildi — hangi hesaba girildigini parola belirliyor.
 * Boylece ekran kac sube oldugunu ve yonetici hesabinin varligini disariya
 * soylemiyor; calisan da her girişte iki dokunus yerine bir sey yaziyor.
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Depo Sistemi</h1>
        <p className="mt-1 text-sm text-neutral-500">Devam etmek icin parolanizi girin.</p>
      </div>

      <input
        type="password"
        name="password"
        autoFocus
        autoComplete="current-password"
        placeholder="Parola"
        className="h-12 w-full rounded-lg border border-neutral-300 px-3 text-base outline-none focus:border-neutral-900"
      />

      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-lg bg-neutral-900 text-base font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Kontrol ediliyor...' : 'Giris yap'}
      </button>
    </form>
  );
}
