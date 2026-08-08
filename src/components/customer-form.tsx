'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface CustomerFormValues {
  name: string;
  phone: string;
  phone2: string;
  email: string;
  address: string;
  city: string;
  district: string;
  taxOffice: string;
  taxNumber: string;
  notes: string;
}

const EMPTY: CustomerFormValues = {
  name: '',
  phone: '',
  phone2: '',
  email: '',
  address: '',
  city: '',
  district: '',
  taxOffice: '',
  taxNumber: '',
  notes: '',
};

interface Props {
  initial?: Partial<CustomerFormValues>;
  submitLabel: string;
  onSubmit: (values: CustomerFormValues) => Promise<{ ok: boolean; error?: string; id?: string }>;
}

export function CustomerForm({ initial, submitLabel, onSubmit }: Props) {
  const [values, setValues] = useState<CustomerFormValues>({ ...EMPTY, ...initial });
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function set<K extends keyof CustomerFormValues>(key: K, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <form
      className="max-w-lg space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await onSubmit(values);
          if (!result.ok) {
            toast.error(result.error ?? 'Kayit basarisiz.');
            return;
          }
          toast.success('Kaydedildi.');
          router.push(result.id ? `/musteriler/${result.id}` : '/musteriler');
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="c-name">Ad soyad / firma</Label>
        <Input
          id="c-name"
          value={values.name}
          onChange={(event) => set('name', event.target.value)}
          className="h-11"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="c-phone">Telefon</Label>
          <Input
            id="c-phone"
            value={values.phone}
            onChange={(event) => set('phone', event.target.value)}
            placeholder="0555 000 00 00"
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-phone2">Ikinci telefon</Label>
          <Input
            id="c-phone2"
            value={values.phone2}
            onChange={(event) => set('phone2', event.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-address">Adres</Label>
        <Input
          id="c-address"
          value={values.address}
          onChange={(event) => set('address', event.target.value)}
          className="h-11"
        />
        <p className="text-xs text-neutral-500">
          Siparis olustururken teslimat adresi buradan on-doldurulur, orada degistirilebilir.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="c-city">Il</Label>
          <Input
            id="c-city"
            value={values.city}
            onChange={(event) => set('city', event.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-district">Ilce</Label>
          <Input
            id="c-district"
            value={values.district}
            onChange={(event) => set('district', event.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="c-taxoffice">Vergi dairesi</Label>
          <Input
            id="c-taxoffice"
            value={values.taxOffice}
            onChange={(event) => set('taxOffice', event.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-taxnumber">Vergi / TC no</Label>
          <Input
            id="c-taxnumber"
            value={values.taxNumber}
            onChange={(event) => set('taxNumber', event.target.value)}
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="c-notes">Not</Label>
        <Input
          id="c-notes"
          value={values.notes}
          onChange={(event) => set('notes', event.target.value)}
          className="h-11"
        />
      </div>

      <Button type="submit" disabled={pending} className="h-11 w-full sm:w-auto">
        {pending ? 'Kaydediliyor...' : submitLabel}
      </Button>
    </form>
  );
}
