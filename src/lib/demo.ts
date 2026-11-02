/**
 * Tanitim kopyasi (depo.catalcamyazilim.online).
 *
 * Ayni kod ayri bir Vercel projesinde, ayri bir veritabaniyla calisiyor;
 * aradaki tek fark bu bayrak. Bayrak acikken giris parolasiz, dosya yukleme
 * kapali, veri her gece sifirlaniyor.
 *
 * `NEXT_PUBLIC_` onekli: istemci bilesenleri de (kilit ekranindaki ipucu)
 * okuyabilsin. Tek basina yetki vermez — parolasiz giris ve sifirlama ayrica
 * veritabaninin adina bakiyor (`domain/demo/guard.ts`); bayrak yanlislikla
 * canli projeye girse bile canli veritabaninda ikisi de calismaz.
 */
export function isDemo(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === '1';
}

/**
 * Demoda Google Analytics ve Microsoft Clarity. Yalnizca demo projesinde
 * tanimli ayri bir bayrak; demo bayragiyla birlikte acik degilse hicbir olcum
 * kodu sayfaya girmez. Gercek isletmenin kurulumunda ikisi de yok, yani
 * dukkanin ekranlari ve verisi bu hesaplara hicbir kosulda gitmez.
 */
export function isDemoAnalytics(): boolean {
  return isDemo() && process.env.NEXT_PUBLIC_DEMO_ANALYTICS === '1';
}

/** Demo veritabaninin adi. Canli veritabani baska adla aciliyor. */
export const DEMO_DATABASE = 'depo_demo';

/** Stok ve rapor kilidinin demodaki parolasi; kilit ekraninda yaziyor. */
export const DEMO_UNLOCK_PASSWORD = 'demo1234';

export const DEMO_CONTACT_URL = 'https://instagram.com/catalcamyazilim';
