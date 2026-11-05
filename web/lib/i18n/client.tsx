'use client';

import { createContext, useContext } from 'react';
import { dictionaries, type Dictionary } from './dictionaries';
import { DEFAULT_LOCALE, type Locale } from './locales';

// The page's language, for client components. Only the locale crosses from the server;
// the dictionaries themselves are bundled, so they aren't sent again with every page.
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): Dictionary {
  return dictionaries[useContext(LocaleContext)];
}
