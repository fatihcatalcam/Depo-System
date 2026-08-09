const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

const longDateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'long',
  timeZone: 'Europe/Istanbul',
});

const dateTimeFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

/**
 * `date` sutunlari saatsiz gelir; UTC gece yarisi olarak okuyoruz ki
 * saat dilimi kaymasi bir gun geriye atmasin.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return dateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export function formatLongDate(value: string): string {
  return longDateFormatter.format(new Date(`${value}T00:00:00Z`));
}

export function formatDateTime(value: Date): string {
  return dateTimeFormatter.format(value);
}

/** Bugunun tarihi, Europe/Istanbul'a gore YYYY-MM-DD. */
export function todayInIstanbul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
}
