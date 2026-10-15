'use client';

import { useState } from 'react';
import { TimecallControls } from '@/app/head-judge/_components/TimecallControls';
import { setMyTeamTimecalls } from '@/lib/player-timecall-actions';

// The player's own team's time calls, set before the pool plays. A change shows
// at once and is saved in the background; if saving fails it goes back.
export function MyTimecalls({
  teamId,
  initial,
  routineSeconds,
}: {
  teamId: string;
  initial: number[];
  routineSeconds: number;
}) {
  const [timecalls, setTimecalls] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = (next: number[]) => {
    const before = timecalls;
    setTimecalls(next);
    setError(null);
    setSaving(true);
    setMyTeamTimecalls(teamId, next)
      .then(
        (result) => {
          if (result.error) {
            setTimecalls(before);
            setError(result.error);
          }
        },
        () => {
          setTimecalls(before);
          setError('Not saved. Check the connection and try again.');
        }
      )
      .finally(() => setSaving(false));
  };

  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-sm font-medium text-gray-600">
        Your time calls
        {saving && <span className="ml-2 font-normal text-gray-400">Saving…</span>}
      </h3>
      <p className="text-xs text-gray-500">Called out during your routine when this much time is left.</p>
      <TimecallControls
        timecalls={timecalls}
        routineSeconds={routineSeconds}
        disabled={false}
        onChange={change}
        align="start"
      />
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
    </section>
  );
}
