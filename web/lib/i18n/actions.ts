'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { pool } from '../db';
import { LOCALE_COOKIE, isLocale } from './locales';

// Switches the site's language: on this device (cookie) and, when signed in, on the
// account, so it follows them to other devices.
export async function setLanguage(language: string): Promise<void> {
  if (!isLocale(language)) return;
  (await cookies()).set(LOCALE_COOKIE, language, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', path: '/' });

  const session = await auth();
  if (session?.user?.id) {
    try {
      await pool.query('UPDATE users SET language = $1 WHERE id = $2', [language, session.user.id]);
    } catch (err) {
      // The cookie still switches this device (e.g. a laptop's local copy predates the column).
      console.error('Could not save the language on the account', err);
    }
  }
  revalidatePath('/', 'layout');
}
