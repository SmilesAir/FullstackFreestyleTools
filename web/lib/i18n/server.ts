import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { pool } from '../db';
import { dictionaries, type Dictionary } from './dictionaries';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './locales';

// The language this request is shown in: a signed-in account's own choice (so it follows
// them to any device), else this device's `lang` cookie, else English.
export const getLocale = cache(async (): Promise<Locale> => {
  const session = await auth().catch(() => null);
  if (session?.user?.id) {
    const saved = await getUserLocale(session.user.id);
    if (saved) return saved;
  }
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(cookie) ? cookie : DEFAULT_LOCALE;
});

export async function getT(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}

// Null when there's no such account, or the database can't say (it's unreachable, or a
// laptop's local copy predates the column) - the cookie decides then.
export async function getUserLocale(userId: string): Promise<Locale | null> {
  try {
    const result = await pool.query<{ language: string }>('SELECT language FROM users WHERE id = $1', [userId]);
    const language = result.rows[0]?.language;
    return isLocale(language) ? language : null;
  } catch {
    return null;
  }
}
