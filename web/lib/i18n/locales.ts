// The languages the site can be shown in. English is the default and the source every
// other language's dictionary is checked against (lib/i18n/dictionaries.ts).
export const LOCALES = ['en', 'es'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

// The cookie a device keeps its language in (signed-in accounts also keep it on the account).
export const LOCALE_COOKIE = 'lang';

// What Intl and <html lang> get for each language: Spanish is Latin American Spanish.
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-US', es: 'es-419' };

// Each language's name in itself, for the language chooser.
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', es: 'Español' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
