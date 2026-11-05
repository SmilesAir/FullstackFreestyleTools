'use client';

import { useState, useTransition } from 'react';
import { sendTestDiscordDM } from '@/lib/profile-actions';
import { useT } from '@/lib/i18n/client';

export function TestDmButton({ disabled }: { disabled: boolean }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error: string | null } | null>(null);

  function onClick() {
    startTransition(async () => {
      setResult(await sendTestDiscordDM());
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || pending}
        className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
      >
        {pending ? t.profile.sending : t.profile.sendTestDm}
      </button>
      {result &&
        (result.error ? (
          <p className="mt-1 text-sm text-red-600">{result.error}</p>
        ) : (
          <p className="mt-1 text-sm text-green-600">{t.profile.testDmSent}</p>
        ))}
    </div>
  );
}
