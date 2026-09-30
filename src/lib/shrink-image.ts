/**
 * Telefon fotografini yuklemeden once kucultur (tarayicida).
 *
 * Telefon kamerasi 3-8 MB'lik fotograf cekiyor; sunucu eylemi 4 MB,
 * Vercel 4,5 MB ile sinirli. Irsaliye okumak icin uzun kenari 2000 piksel
 * fazlasiyla yeterli, sonuc genelde 300-700 KB — yukleme de hizlaniyor.
 *
 * PDF'e ve zaten kucuk olan resme dokunulmuyor.
 */
const MAX_EDGE = 2000;
const SKIP_BELOW_BYTES = 1024 * 1024;
const JPEG_QUALITY = 0.85;

export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < SKIP_BELOW_BYTES) return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  // HEIC gibi tarayicinin cizemedigi bicimler: oldugu gibi gonder, sunucu
  // uygun degilse okunur bir hata doner.
  if (!bitmap) return file;

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) return file;

  const name = file.name.replace(/\.[^.]+$/, '') || 'irsaliye';
  return new File([blob], `${name}.jpg`, { type: 'image/jpeg' });
}
