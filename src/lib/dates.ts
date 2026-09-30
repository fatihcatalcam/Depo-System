const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'short',
  timeZone: 'Europe/Istanbul',
});

const longDateFormatter = new Intl.DateTimeFormat('tr-TR', {
  dateStyle: 'long',
  timeZone: 'Europe/Istanbul',
});

const weekdayFormatter = new Intl.DateTimeFormat('tr-TR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
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

/** YYYY-MM-DD tarihe gun ekler (eksi de olur). Saat dilimi kaymasin diye UTC. */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Tarihin haftasinin pazartesisi. Turkiye'de hafta pazartesi baslar. */
export function startOfWeek(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  // getUTCDay: pazar 0, pazartesi 1 ... cumartesi 6.
  return addDays(date, -((day + 6) % 7));
}

/** "Pazartesi 28 Eylül": haftalik sevkiyatta gun basliklari. */
export function formatWeekday(value: string): string {
  return weekdayFormatter.format(new Date(`${value}T00:00:00Z`));
}
