'use client';

import { useOptimistic, useTransition } from 'react';
import { setEventHidden, setEventTest } from '@/lib/event-editor-actions';

// Two independent toggles, copying EventPlayingToggle.tsx's useOptimistic/useTransition
// pattern. Amber (not green) since "on" here is a caution state, not an active/good one.
export function TestHiddenToggles({
  eventId,
  isTest,
  isHidden,
  onChange,
}: {
  eventId: string;
  isTest: boolean;
  isHidden: boolean;
  onChange: (patch: { is_test?: boolean; is_hidden?: boolean }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [shownTest, setShownTest] = useOptimistic(isTest);
  const [shownHidden, setShownHidden] = useOptimistic(isHidden);

  function toggleTest() {
    const next = !shownTest;
    startTransition(async () => {
      setShownTest(next);
      const result = await setEventTest(eventId, next);
      if (!result.error) onChange({ is_test: next });
    });
  }

  function toggleHidden() {
    const next = !shownHidden;
    startTransition(async () => {
      setShownHidden(next);
      const result = await setEventHidden(eventId, next);
      if (!result.error) onChange({ is_hidden: next });
    });
  }

  return (
    <div className="flex flex-wrap gap-4">
      <button
        type="button"
        role="switch"
        aria-checked={shownTest}
        onClick={toggleTest}
        disabled={pending}
        className="flex cursor-pointer items-center gap-2 text-sm disabled:cursor-wait"
      >
        <span className={shownTest ? 'font-medium text-amber-700' : 'text-gray-500'}>Test event</span>
        <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${shownTest ? 'bg-amber-500' : 'bg-gray-300'}`}>
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${shownTest ? 'left-[18px]' : 'left-0.5'}`}
          />
        </span>
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={shownHidden}
        onClick={toggleHidden}
        disabled={pending}
        className="flex cursor-pointer items-center gap-2 text-sm disabled:cursor-wait"
      >
        <span className={shownHidden ? 'font-medium text-amber-700' : 'text-gray-500'}>Hidden</span>
        <span className={`relative inline-block h-5 w-9 rounded-full transition-colors ${shownHidden ? 'bg-amber-500' : 'bg-gray-300'}`}>
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${shownHidden ? 'left-[18px]' : 'left-0.5'}`}
          />
        </span>
      </button>
    </div>
  );
}
