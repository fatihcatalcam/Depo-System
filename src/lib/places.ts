/**
 * Teslimat yeri icin varsayilanlar ve Istanbul ilceleri.
 *
 * Dukkanin teslimatlarinin neredeyse tamami Istanbul ici; il ve ulke
 * varsayilan dolu geliyor, degistirilebiliyor. Ilce listesi formda secim
 * kolayligi icin — serbest yazim da kabul ediliyor, liste dayatilmiyor.
 */
export const DEFAULT_CITY = 'İstanbul';
export const DEFAULT_COUNTRY = 'Türkiye';

export const ISTANBUL_DISTRICTS = [
  'Adalar',
  'Arnavutköy',
  'Ataşehir',
  'Avcılar',
  'Bağcılar',
  'Bahçelievler',
  'Bakırköy',
  'Başakşehir',
  'Bayrampaşa',
  'Beşiktaş',
  'Beykoz',
  'Beylikdüzü',
  'Beyoğlu',
  'Büyükçekmece',
  'Çatalca',
  'Çekmeköy',
  'Esenler',
  'Esenyurt',
  'Eyüpsultan',
  'Fatih',
  'Gaziosmanpaşa',
  'Güngören',
  'Kadıköy',
  'Kağıthane',
  'Kartal',
  'Küçükçekmece',
  'Maltepe',
  'Pendik',
  'Sancaktepe',
  'Sarıyer',
  'Silivri',
  'Sultanbeyli',
  'Sultangazi',
  'Şile',
  'Şişli',
  'Tuzla',
  'Ümraniye',
  'Üsküdar',
  'Zeytinburnu',
] as const;

/**
 * Tek satirlik yer bilgisi: "Başakşehir / İstanbul". Ulke yalnizca
 * Turkiye disindaysa yaziliyor; her kagitta "Türkiye" yazmak gurultu.
 */
export function formatPlace(place: {
  district: string | null;
  city: string | null;
  country: string | null;
}): string {
  const parts = [place.district, place.city].filter((part): part is string => Boolean(part));
  if (place.country && place.country !== DEFAULT_COUNTRY) parts.push(place.country);
  return parts.join(' / ');
}
