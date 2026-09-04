'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateOrderAction } from '../actions';

interface Props {
  orderId: string;
  plannedDeliveryDate: string | null;
  deliveryAddress: string;
  deliveryPhone: string | null;
  deliveryPhone2: string | null;
  deliveryNotes: string | null;
}

/**
 * Teslimat planini siparis olusturulduktan sonra da degistirebilmek gerekiyor:
 * gunluk sevkiyat listesi tamamen bu tarihe dayaniyor.
 */
export function DeliveryPlan({
  orderId,
  plannedDeliveryDate,
  deliveryAddress,
  deliveryPhone,
  deliveryPhone2,
  deliveryNotes,
}: Props) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(plannedDeliveryDate ?? '');
  const [address, setAddress] = useState(deliveryAddress);
  const [phone, setPhone] = useState(deliveryPhone ?? '');
  const [phone2, setPhone2] = useState(deliveryPhone2 ?? '');
  const [notes, setNotes] = useState(deliveryNotes ?? '');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <Button variant="ghost" className="h-9 px-2 text-xs" onClick={() => setOpen(true)}>
        Teslimat planini duzenle
      </Button>
    );
  }

  return (
    <form
      className="mt-3 space-y-3 rounded-lg border border-neutral-300 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await updateOrderAction(orderId, {
            plannedDeliveryDate: date || null,
            deliveryPhone2: phone2,
            deliveryAddress: address,
            deliveryPhone: phone || undefined,
            deliveryNotes: notes || undefined,
          });
          if (result.ok) {
            toast.success('Teslimat plani guncellendi.');
            setOpen(false);
            router.refresh();
          } else {
            toast.error(result.error ?? 'Guncellenemedi.');
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="plan-date">Planlanan teslimat</Label>
          <Input
            id="plan-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-phone">Teslimat telefonu</Label>
          <Input
            id="plan-phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-phone2">Ikinci telefon</Label>
          <Input
            id="plan-phone2"
            value={phone2}
            onChange={(event) => setPhone2(event.target.value)}
            placeholder="Es, ev ya da is numarasi"
            className="h-11"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="plan-address">Teslimat adresi</Label>
        <Input
          id="plan-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          className="h-11"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="plan-notes">Teslimat notu</Label>
        <Input
          id="plan-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="3. kat, asansor yok"
          className="h-11"
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="h-11">
          {pending ? 'Kaydediliyor...' : 'Kaydet'}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={() => setOpen(false)}>
          Vazgec
        </Button>
      </div>
    </form>
  );
}
