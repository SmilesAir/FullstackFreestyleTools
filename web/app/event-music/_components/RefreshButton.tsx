'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useT } from '@/lib/i18n/client';
import { formatTime } from '@/lib/i18n/format';

// Reads the event's pools, teams and songs again now, for a song just changed
// on another screen. (The page also notices changes by itself on every poll.)
export function RefreshButton() {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const refresh = () => {
    startTransition(() => {
      router.refresh();
      setCheckedAt(formatTime(locale, new Date()));
    });
  };

  return (
    <div className="flex items-center gap-3">
      {(pending || checkedAt) && (
        <span className="text-xs text-gray-500">{pending ? t.eventMusic.checking : t.eventMusic.checkedAt(checkedAt ?? '')}</span>
      )}
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="cursor-pointer rounded border border-gray-300 bg-background px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50"
      >
        {t.eventMusic.refreshSongs}
      </button>
    </div>
  );
}
