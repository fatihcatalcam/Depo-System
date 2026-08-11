'use client';

import { useActionState, useState } from 'react';
import { loginAction, type LoginState } from './actions';

const initialState: LoginState = {};

export interface BranchOption {
  id: string;
  label: string;
}

interface Props {
  branches: BranchOption[];
  defaultBranch: string;
}

/**
 * Giris ekraninda yalnizca subeler listelenir.
 *
 * Yoneticinin dugmesi yok: kendi parolasi var, hangi sube secili olursa olsun
 * o parola girilince yonetici hesabi acilir. Boylece patronun hesabi
 * calisanlarin her gun gordugu ekranda durmuyor.
 */
export function LoginForm({ branches, defaultBranch }: Props) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [branchId, setBranchId] = useState(defaultBranch);

  return (
    <form
      action={formAction}
      className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Depo Sistemi</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {branches.length > 0
            ? 'Subenizi secip parolayi girin.'
            : 'Devam etmek icin parolayi girin.'}
        </p>
      </div>

      <input type="hidden" name="branchId" value={branchId} />

      {/* Iki-uc secenek icin acilir liste yerine dugmeler: telefonda tek
          dokunus, hangi subede olundugu her zaman gorunur. */}
      {branches.length > 0 ? (
        <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Sube">
          {branches.map((option) => {
            const selected = option.id === branchId;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setBranchId(option.id)}
                className={`h-12 rounded-lg border px-3 text-base font-medium transition ${
                  selected
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-300 text-neutral-700 hover:border-neutral-500'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}

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
