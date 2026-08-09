'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function shift(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function DatePicker({ date }: { date: string }) {
  const router = useRouter();
  const go = (value: string) => router.push(`/sevkiyat?tarih=${value}`);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" className="h-11" onClick={() => go(shift(date, -1))}>
        Onceki gun
      </Button>
      <Input
        type="date"
        value={date}
        onChange={(event) => {
          if (event.target.value) go(event.target.value);
        }}
        className="h-11 w-44"
        aria-label="Sevkiyat tarihi"
      />
      <Button variant="outline" className="h-11" onClick={() => go(shift(date, 1))}>
        Sonraki gun
      </Button>
    </div>
  );
}
