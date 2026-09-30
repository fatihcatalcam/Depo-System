import { formatPlace } from '@/lib/places';

interface Props {
  district: string | null;
  city: string | null;
  country: string | null;
  /** Kagit ciktisi: gri yerine siyah, cunku yazicida gri soluk cikiyor. */
  print?: boolean;
}

/**
 * "Başakşehir / İstanbul" satiri. Ilce adresin ustunde ve kalin: sofor ve
 * sevkiyati planlayan once ilceye bakiyor, sokak adresine sonra.
 */
export function PlaceLine({ district, city, country, print = false }: Props) {
  const text = formatPlace({ district, city, country });
  if (!text) return null;

  return (
    <div className={print ? 'text-base font-bold' : 'font-semibold text-neutral-900'}>{text}</div>
  );
}
