'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deliverStopAction } from '../siparisler/actions';

interface Props {
  orderId: string;
  customerName: string;
  /** Bu durakta kalan toplam parca; onay metninde gosteriliyor. */
  pieces: number;
}

/**
 * "Teslim edildi": duraktaki her seyi tek tiklamada teslim eder ve stoktan
 * duser. Arac dondugunde parca parca isaretlemek yerine kullanilir.
 *
 * Kismi teslimat (yatak gitti, baza kaldi) icin siparis detayindaki ayrintili
 * form duruyor; burasi "hepsi gitti" durumu icin.
 */
export function DeliverStopButton({ orderId, customerName, pieces }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(allowNegativeStock: boolean) {
    startTransition(async () => {
      const result = await deliverStopAction(orderId, { allowNegativeStock });

      if (result.ok) {
        toast.success(`${customerName} teslim edildi, stoktan dusuldu.`);
        router.refresh();
        return;
      }

      // Stok yetmiyor: kullaniciya acikca soruyoruz. Sessizce eksiye dusurmek
      // depo sayimini aciklanamaz hale getirirdi.
      if (result.needsStockOverride) {
        if (window.confirm(`${result.error}\n\nStok eksiye dusecek. Yine de teslim edilsin mi?`)) {
          run(true);
        }
        return;
      }

      toast.error(result.error ?? 'Teslimat kaydedilemedi.');
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="h-10 whitespace-nowrap"
      disabled={pending}
      onClick={() => {
        if (window.confirm(`${customerName} · ${pieces} parca teslim edildi olarak isaretlensin mi?`)) {
          run(false);
        }
      }}
    >
      {pending ? 'Kaydediliyor...' : 'Teslim edildi'}
    </Button>
  );
}
