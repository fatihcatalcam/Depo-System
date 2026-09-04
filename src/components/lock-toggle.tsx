'use client';

import { Lock, LockOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { lockStockAction, unlockStockPermanentlyAction } from '@/app/(panel)/kilit-actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  locked: boolean;
}

/**
 * Stok kilidi dugmesi.
 *
 * Kilitlemek serbest, acmak parola ister. Amac yetki degil dikkat: telefon
 * elden ele dolasirken ya da masada dururken stok yanlislikla degismesin.
 */
export function LockToggle({ locked }: Props) {
  const [asking, setAsking] = useState(false);
  const [password, setPassword] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!locked) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-11 gap-1.5 px-3"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await lockStockAction();
            toast.success('Stok kilitlendi.');
            router.refresh();
          })
        }
      >
        <LockOpen className="size-4" />
        Stok acik
      </Button>
    );
  }

  if (!asking) {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-11 gap-1.5 border-amber-300 bg-amber-50 px-3 text-amber-800 hover:border-amber-500"
        onClick={() => setAsking(true)}
      >
        <Lock className="size-4" />
        Stok kilitli
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await unlockStockPermanentlyAction(password);
          if (!result.ok) {
            toast.error(result.error ?? 'Kilit acilamadi.');
            return;
          }
          setPassword('');
          setAsking(false);
          toast.success('Stok kilidi acildi.');
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
        aria-label="Stok kilidi parolasi"
        className="h-11 w-36"
      />
      <Button type="submit" disabled={pending} className="h-11">
        {pending ? '...' : 'Ac'}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="h-11"
        onClick={() => {
          setPassword('');
          setAsking(false);
        }}
      >
        Vazgec
      </Button>
    </form>
  );
}
