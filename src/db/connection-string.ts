/**
 * Neon'un verdigi baglanti adresi `sslmode=require` iceriyor. `pg` bunu su an
 * `verify-full` gibi ele aliyor ama v9'da libpq semantigine gecip sertifika
 * dogrulamasini birakacak — yani sessizce zayiflayacak.
 *
 * Bugun davranisi degistirmeyen, yarin zayiflamayi onleyen tek dogru hamle
 * modu acikca yazmak. Ayrica surucunun deprecation uyarisini da susturuyor.
 */
export function hardenSslMode(url: string | undefined): string | undefined {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    const mode = parsed.searchParams.get('sslmode');
    if (mode === 'require' || mode === 'prefer' || mode === 'verify-ca') {
      parsed.searchParams.set('sslmode', 'verify-full');
    }
    return parsed.toString();
  } catch {
    // Adres cozumlenemiyorsa dokunma; baglanti hatasi zaten kendini gosterir.
    return url;
  }
}
