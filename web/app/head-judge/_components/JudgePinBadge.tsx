'use client';

import { useState } from 'react';
import { newJudgePin } from '@/lib/head-judge-actions';

// The event's judge PIN, for the Head Judge to read out: each judging device
// enters it once after picking its judge. "New PIN" signs every device out (a
// PIN that got around). Test events need no PIN.
export function JudgePinBadge({
  eventId,
  pin: initialPin,
  testEvent,
  error: initialError,
}: {
  eventId: string;
  pin: string | null;
  testEvent: boolean;
  error: string | null;
}) {
  const [pin, setPin] = useState(initialPin);
  const [error, setError] = useState(initialError);
  const [working, setWorking] = useState(false);

  if (testEvent) return <span>Judge PIN: none (test event)</span>;

  async function regenerate() {
    if (!window.confirm('Make a new judge PIN? Every judge will need to enter the new one.')) return;
    setWorking(true);
    setError(null);
    const result = await newJudgePin(eventId).catch(() => ({ error: 'Could not make a new PIN', pin: undefined }));
    setWorking(false);
    if (result.error || !result.pin) return setError(result.error ?? 'Could not make a new PIN');
    setPin(result.pin);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>
        Judge PIN:{' '}
        <span className="rounded bg-gray-900 px-1.5 py-0.5 font-mono text-sm font-bold tracking-widest text-white">
          {pin ?? '--'}
        </span>
      </span>
      <button
        type="button"
        onClick={regenerate}
        disabled={working}
        className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-900 hover:bg-gray-100 disabled:opacity-50"
      >
        {working ? 'Making…' : 'New PIN'}
      </button>
      {error && <span className="text-red-600">{error}</span>}
    </span>
  );
}
