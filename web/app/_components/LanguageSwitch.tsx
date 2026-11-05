'use client';

import { useOptimistic, useTransition } from 'react';
import { setLanguage } from '@/lib/i18n/actions';
import { useLocale, useT } from '@/lib/i18n/client';
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n/locales';

// The small EN | ES switch. `inline` sits beside a page's Control Panel link
// (ControlPanelLink.tsx) or in a header; otherwise it floats in the bottom-left
// corner, for pages with no such link: the judges' screens and the public pages
// (judges and viewers aren't signed in). The root layout always renders the
// floating one; globals.css hides it on a page that shows an inline one.
// Signed in, the choice is also saved on the account (Profile shows it too).
export function LanguageSwitch({ inline = false }: { inline?: boolean }) {
  const locale = useLocale();
  const t = useT();
  // Shows the language picked straight away; the page itself follows once the
  // server has rendered it in that language, and the picked side pulses meanwhile.
  const [shown, setShown] = useOptimistic(locale);
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={t.common.language}
      aria-busy={pending}
      className={`${
        inline ? 'lang-inline inline-flex shrink-0 align-middle' : 'lang-floating fixed bottom-2 left-2 z-50 flex shadow-sm'
      } overflow-hidden rounded border border-gray-300 bg-background/90 text-[11px] leading-none print:hidden`}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={LOCALE_NAMES[l]}
          aria-pressed={l === shown}
          onClick={() =>
            l !== shown &&
            startTransition(async () => {
              setShown(l);
              await setLanguage(l);
            })
          }
          className={`cursor-pointer px-1.5 py-1 uppercase ${l === shown ? 'bg-black font-semibold text-white' : 'text-gray-500 hover:bg-gray-100'} ${
            l === shown && pending ? 'animate-pulse' : ''
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
