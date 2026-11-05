'use client';

import { useState } from 'react';
import { TimecallControls } from '@/app/head-judge/_components/TimecallControls';
import { setMyTeamTimecalls } from '@/lib/player-timecall-actions';
import { useT } from '@/lib/i18n/client';

// One of the player's teams' time calls, set before it plays. A change shows at
// once and is saved in the background; if saving fails it goes back.
export function MyTimecalls({
  teamId,
  initial,
  routineSeconds,
  disabled,
}: {
  teamId: string;
  initial: number[];
  routineSeconds: number;
  disabled: boolean;
}) {
  const t = useT();
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
          setError(t.activity.notSaved);
        }
      )
      .finally(() => setSaving(false));
  };

  return (
    <div className="flex flex-col gap-1">
      <TimecallControls
        timecalls={timecalls}
        routineSeconds={routineSeconds}
        disabled={disabled}
        onChange={change}
        align="start"
      />
      {saving && <p className="text-xs text-gray-400">{t.activity.saving}</p>}
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
