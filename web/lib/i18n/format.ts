import { INTL_LOCALE, type Locale } from './locales';

// Dates, times and numbers in a language's own format (es: "4 nov 2026", "1.234").

// A calendar date stored as 'YYYY-MM-DD', read as that day wherever the viewer is.
function localDay(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDay(locale: Locale, isoDate: string): string {
  return localDay(isoDate).toLocaleDateString(INTL_LOCALE[locale], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDayRange(locale: Locale, start: string, end: string): string {
  return start === end ? formatDay(locale, start) : `${formatDay(locale, start)} – ${formatDay(locale, end)}`;
}

export function formatMonth(locale: Locale, year: number, month0: number): string {
  return new Date(year, month0, 1).toLocaleDateString(INTL_LOCALE[locale], { month: 'long', year: 'numeric' });
}

export function formatDateTime(locale: Locale, when: string | number | Date): string {
  return new Date(when).toLocaleString(INTL_LOCALE[locale]);
}

export function formatShortDateTime(locale: Locale, when: string | number | Date): string {
  return new Date(when).toLocaleString(INTL_LOCALE[locale], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatTime(locale: Locale, when: string | number | Date): string {
  return new Date(when).toLocaleTimeString(INTL_LOCALE[locale], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function formatNumber(locale: Locale, n: number, options?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(INTL_LOCALE[locale], options);
}
