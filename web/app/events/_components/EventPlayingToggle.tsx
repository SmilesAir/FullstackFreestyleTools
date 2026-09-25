'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setEventPlaying } from '@/lib/event-creator-actions';

// Switches an event's judges on or off on the public landing page.
export function EventPlayingToggle({ eventId, playing }: { eventId: string; playing: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(playing);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !shown;
    startTransition(async () => {
      setShown(next);
      const result = await setEventPlaying(eventId, next);
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
        title={shown ? 'Judges are listed on the landing page' : 'Judges are not listed on the landing page'}
        className="flex cursor-pointer items-center gap-2 text-sm disabled:cursor-wait"
      >
        <span className={shown ? 'font-medium text-green-700' : 'text-gray-500'}>Playing</span>
        <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${shown ? 'bg-green-600' : 'bg-gray-300'}`}>
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${shown ? 'left-[18px]' : 'left-0.5'}`}
          />
        </span>
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
