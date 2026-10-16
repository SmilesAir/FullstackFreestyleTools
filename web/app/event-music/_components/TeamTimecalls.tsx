'use client';

import { useState } from 'react';
import { TimecallControls } from '@/app/head-judge/_components/TimecallControls';
import { setMusicTeamTimecalls } from '@/lib/event-music-actions';
import { DEFAULT_TIMECALLS, type HeadJudgePool, type HeadJudgeTeam } from '@/lib/head-judge';

type Edit = { from: number[]; value: number[] };

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

// Time calls being changed on this screen, by team id. A change shows at once
// and is kept on top of the saved value it was made from, until the saved
// value changes (the page's data is read again once the server has it).
export function useTimecallEdits() {
  const [edited, setEdited] = useState<Record<string, Edit>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const timecallsOf = (team: HeadJudgeTeam) => {
    const saved = team.timecalls ?? DEFAULT_TIMECALLS;
    const edit = edited[team.id];
    return edit && edit.from.join() === saved.join() ? edit.value : saved;
  };

  const change = (team: HeadJudgeTeam, value: number[]) => {
    const teamId = team.id;
    const from = team.timecalls ?? DEFAULT_TIMECALLS;
    setErrors((current) => without(current, teamId));
    setEdited((current) => ({ ...current, [teamId]: { from, value } }));
    const fail = (message: string) => {
      setEdited((current) => without(current, teamId));
      setErrors((current) => ({ ...current, [teamId]: message }));
    };
    setMusicTeamTimecalls(teamId, value).then(
      (result) => {
        if (result.error) fail(result.error);
      },
      () => fail('Time calls not saved. Check the connection and try again.')
    );
  };

  return { timecallsOf, change, errorOf: (teamId: string) => errors[teamId] ?? null };
}

export type TimecallEdits = ReturnType<typeof useTimecallEdits>;

// A team's time call buttons, disabled while its pool is locked, and the mute
// button for the callouts when given one.
export function TeamTimecalls({
  team,
  pool,
  edits,
  muted,
  onToggleMute,
  align = 'start',
}: {
  team: HeadJudgeTeam;
  pool: HeadJudgePool;
  edits: TimecallEdits;
  muted?: boolean;
  onToggleMute?: () => void;
  align?: 'start' | 'end';
}) {
  const error = edits.errorOf(team.id);
  return (
    <div className={`flex flex-col gap-1 ${align === 'end' ? 'items-end' : 'items-start'}`}>
      <TimecallControls
        timecalls={edits.timecallsOf(team)}
        routineSeconds={pool.routineSeconds}
        disabled={pool.locked}
        onChange={(value) => edits.change(team, value)}
        muted={muted}
        onToggleMute={onToggleMute}
        align={align}
      />
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
