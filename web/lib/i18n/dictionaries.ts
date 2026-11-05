import { en } from './en';
import { es } from './es';
import type { Locale } from './locales';

// Every piece of text the site shows, per language. Server code gets one with getT()
// (lib/i18n/server.ts), client components with useT() (lib/i18n/client.tsx).
export type Dictionary = typeof en;

export const dictionaries: Record<Locale, Dictionary> = { en, es };
