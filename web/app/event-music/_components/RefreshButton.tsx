'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

// Reads the event's pools, teams and songs again now, for a song just changed
// on another screen. (The page also notices changes by itself on every poll.)
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const refresh = () => {
    startTransition(() => {
      router.refresh();
      setCheckedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }));
    });
  };

  return (
    <div className="flex items-center gap-3">
      {(pending || checkedAt) && (
        <span className="text-xs text-gray-500">{pending ? 'Checking…' : `Checked at ${checkedAt}`}</span>
      )}
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="cursor-pointer rounded border border-gray-300 bg-background px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-50"
      >
        ↻ Refresh songs
      </button>
    </div>
  );
}
