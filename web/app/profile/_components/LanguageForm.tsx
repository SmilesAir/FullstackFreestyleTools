'use client';

import { useOptimistic, useTransition } from 'react';
import { setLanguage } from '@/lib/i18n/actions';
import { useLocale, useT } from '@/lib/i18n/client';
import { LOCALES, LOCALE_NAMES, isLocale } from '@/lib/i18n/locales';

// The account's language: saved on the account, so it follows them to every device.
export function LanguageForm() {
  const locale = useLocale();
  const t = useT();
  // Shows the language picked straight away (see LanguageSwitch.tsx).
  const [shown, setShown] = useOptimistic(locale);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-500">{t.profile.languageHelp}</p>
      <div className="flex items-center gap-2">
        <select
          value={shown}
          aria-label={t.common.language}
          onChange={(e) => {
            const next = e.target.value;
            if (!isLocale(next)) return;
            startTransition(async () => {
              setShown(next);
              await setLanguage(next);
            });
          }}
          aria-busy={pending}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          {LOCALES.map((l) => (
            <option key={l} value={l} lang={l}>
              {LOCALE_NAMES[l]}
            </option>
          ))}
        </select>
        {/* While the page changes language. */}
        {pending && (
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700"
          />
        )}
      </div>
    </div>
  );
}
