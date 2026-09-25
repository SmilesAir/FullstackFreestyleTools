'use client';

import { useState } from 'react';
import { JUDGE_CATEGORY_LABELS } from '@/lib/event-creator';
import { teamName, type HeadJudgeDivision, type HeadJudgePool } from '@/lib/head-judge';

// Every pool that has teams, grouped by division and then round. A pool row
// expands to show its teams and judges and has the button that makes it the
// playing pool.
export function PoolsTab({
  divisions,
  playingKey,
  routineRunning,
  onSetPlaying,
}: {
  divisions: HeadJudgeDivision[];
  playingKey: string | null;
  // The playing pool can't be changed while a routine is running.
  routineRunning: boolean;
  onSetPlaying: (key: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  if (divisions.every((d) => d.rounds.length === 0)) {
    return <p className="text-sm text-gray-500">No pools with teams yet. Set them up in the Event Creator.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {divisions
        .filter((d) => d.rounds.length > 0)
        .map((division) => (
          <section key={division.id} className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{division.name}</h2>
            {division.rounds.map((round) => (
              <div key={round.number} className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-gray-600">{round.name}</h3>
                {round.pools.map((pool) => (
                  <PoolRow
                    key={pool.key}
                    pool={pool}
                    expanded={open.has(pool.key)}
                    playing={pool.key === playingKey}
                    locked={routineRunning}
                    onToggle={() => toggle(pool.key)}
                    onSetPlaying={() => onSetPlaying(pool.key)}
                  />
                ))}
              </div>
            ))}
          </section>
        ))}
    </div>
  );
}

function PoolRow({
  pool,
  expanded,
  playing,
  locked,
  onToggle,
  onSetPlaying,
}: {
  pool: HeadJudgePool;
  expanded: boolean;
  playing: boolean;
  locked: boolean;
  onToggle: () => void;
  onSetPlaying: () => void;
}) {
  // A pool that needs judges and has none yet stands out.
  const noJudges = pool.usesJudges && pool.judges.length === 0;

  return (
    <div className={`rounded border ${playing ? 'border-green-600' : 'border-gray-300'}`}>
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex cursor-pointer items-center gap-2 text-left"
        >
          <span aria-hidden className={`inline-block text-sm text-gray-500 transition-transform ${expanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
          <span className="font-medium">Pool {pool.letter}</span>
          <span className="text-sm text-gray-500">
            {pool.teams.length} {pool.teams.length === 1 ? 'team' : 'teams'} ·{' '}
            <span className={noJudges ? 'rounded bg-amber-200 px-1.5 py-0.5 font-semibold text-amber-900' : ''}>
              {pool.judges.length} {pool.judges.length === 1 ? 'judge' : 'judges'}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onSetPlaying}
          disabled={playing || locked}
          title={locked && !playing ? 'A routine is running. Cancel it before changing the pool.' : undefined}
          className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          Set as playing pool
        </button>
        {playing && <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Playing</span>}
      </div>

      {expanded && (
        <div className="grid gap-4 border-t border-gray-200 px-3 py-3 sm:grid-cols-2">
          <div>
            <h4 className="mb-1 text-sm font-medium text-gray-600">Teams</h4>
            <ol className="flex flex-col gap-0.5">
              {pool.teams.map((team, i) => (
                <li key={team.id}>
                  <span className="mr-2 text-gray-400">{i + 1}.</span>
                  {teamName(team)}
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h4 className="mb-1 text-sm font-medium text-gray-600">Judges</h4>
            {pool.judges.length === 0 ? (
              <p className="text-sm text-gray-500">No judges set.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {pool.judges.map((judge) => (
                  <li key={judge.playerId}>
                    {judge.name}{' '}
                    <span className="text-sm text-gray-500">({JUDGE_CATEGORY_LABELS[judge.categoryType] ?? judge.categoryType})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
