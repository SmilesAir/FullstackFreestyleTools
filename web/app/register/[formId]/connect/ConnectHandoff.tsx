'use client';

import { useState, useTransition } from 'react';
import { useT } from '@/lib/i18n/client';
import { completeHandoff } from '@/lib/registration-actions';

// Asks before letting the embed act for this account, then closes the window.
export function ConnectHandoff({
  formId,
  code,
  eventName,
  who,
  switchHref,
}: {
  formId: string;
  code: string;
  eventName: string;
  who: string;
  switchHref: string;
}) {
  const t = useT().eventRegistration;
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const proceed = () =>
    startTransition(async () => {
      const result = await completeHandoff(formId, code);
      if (result.error) return setError(result.error);
      setDone(true);
      setTimeout(() => window.close(), 800);
    });

  return (
    <main className="mx-auto flex max-w-sm flex-col items-center gap-4 px-4 py-16 text-center text-sm">
      {done ? (
        <p>{t.signedInClose}</p>
      ) : (
        <>
          <p>{t.continueAs(who, eventName)}</p>
          <button
            type="button"
            onClick={proceed}
            disabled={pending}
            className="cursor-pointer rounded bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {pending ? t.checking : t.continue}
          </button>
          <a href={switchHref} className="text-xs text-blue-600 underline">
            {t.notYou}
          </a>
          {error && <p className="text-red-600">{error}</p>}
        </>
      )}
    </main>
  );
}
