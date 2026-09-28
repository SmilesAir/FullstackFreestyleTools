'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setEventBridgeEnabled } from '@/lib/bridge-actions';

// Opts this one event into the Dynamo bridge (see web/lib/bridge/) or back out. Off by
// default for every event; nothing bidirectional happens for an event until this is on.
export function EventBridgeToggle({ eventId, enabled }: { eventId: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(enabled);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !shown;
    startTransition(async () => {
      setShown(next);
      const result = await setEventBridgeEnabled(eventId, next);
      setError(result.error);
      if (!result.error) router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={shown}
        onClick={toggle}
        disabled={pending}
        title={shown ? 'Synced with the live app’s DynamoDB table' : 'Not synced with the live app'}
        className="flex cursor-pointer items-center gap-2 text-sm disabled:cursor-wait"
      >
        <span className={shown ? 'font-medium text-indigo-700' : 'text-gray-500'}>Bridge</span>
        <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${shown ? 'bg-indigo-600' : 'bg-gray-300'}`}>
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${shown ? 'left-[18px]' : 'left-0.5'}`}
          />
        </span>
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
