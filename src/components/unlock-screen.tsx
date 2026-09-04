'use client';

import { Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { unlockAction } from '@/app/(panel)/kilit-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LockArea } from '@/lib/auth/locks';

interface Props {
  area: LockArea;
  title: string;
  description: string;
}

/** Kilitli bir ekranin yerine gecen parola formu. */
export function UnlockScreen({ area, title, description }: Props) {
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-neutral-100">
        <Lock className="size-5 text-neutral-600" />
      </div>

      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{description}</p>
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            const result = await unlockAction(area, password);
            if (!result.ok) {
              toast.error(result.error ?? 'Kilit acilamadi.');
              return;
            }
            setPassword('');
            router.refresh();
          });
        }}
      >
        <Input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Parola"
          aria-label={`${title} parolasi`}
          className="h-12 text-center"
        />
        <Button type="submit" disabled={pending} className="h-12 w-full">
          {pending ? 'Kontrol ediliyor...' : 'Ac'}
        </Button>
      </form>
    </div>
  );
}
