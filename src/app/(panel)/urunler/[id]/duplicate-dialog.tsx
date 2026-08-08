'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { duplicateProductAction } from '../actions';

interface Props {
  productId: string;
  productName: string;
}

export function DuplicateDialog({ productId, productName }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [size, setSize] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <Button variant="outline" className="h-11" onClick={() => setOpen(true)}>
        Baska boyuta kopyala
      </Button>
    );
  }

  return (
    <div className="w-full max-w-md space-y-3 rounded-lg border border-neutral-300 bg-white p-4">
      <div>
        <h2 className="text-sm font-semibold">Baska boyuta kopyala</h2>
        <p className="text-xs text-neutral-500">
          {productName} recetesindeki her parcanin hedef boyuttaki karsiligi otomatik bulunur.
          Karsiligi olmayan parca varsa uyari verir.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dup-size">Hedef boyut</Label>
        <Input
          id="dup-size"
          value={size}
          onChange={(event) => setSize(event.target.value)}
          placeholder="100x200"
          className="h-11"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="dup-name">Yeni urun adi</Label>
        <Input
          id="dup-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Yatak A 100x200 Cift Kisilik"
          className="h-11"
        />
      </div>

      <div className="flex gap-2">
        <Button
          className="h-11"
          disabled={pending || !name.trim() || !size.trim()}
          onClick={() =>
            startTransition(async () => {
              const result = await duplicateProductAction(productId, {
                name,
                targetSizeLabel: size,
              });
              if (result.ok && result.id) {
                toast.success('Urun kopyalandi.');
                router.push(`/urunler/${result.id}`);
                router.refresh();
              } else {
                toast.error(result.error ?? 'Kopyalama basarisiz.');
              }
            })
          }
        >
          {pending ? 'Kopyalaniyor...' : 'Kopyala'}
        </Button>
        <Button variant="ghost" className="h-11" onClick={() => setOpen(false)}>
          Vazgec
        </Button>
      </div>
    </div>
  );
}
