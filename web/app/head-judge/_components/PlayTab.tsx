'use client';

import { useEffect, useState } from 'react';
import { JUDGE_CATEGORY_LABELS } from '@/lib/event-creator';
import { teamName, type HeadJudgePool } from '@/lib/head-judge';
import { elapsedMs, formatElapsed } from '@/lib/head-judge-state';
import { PoolResults } from './PoolResults';
import type { SaveStatus } from './usePlayState';

// The pool being played: where it is, the routine timer and controls, who is
// on, and how it's going.
export function PlayTab({
  pool,
  playingTeamId,
  routineStartedAt,
  clockOffset,
  saveStatus,
  onSelectTeam,
  onStart,
  onCancel,
}: {
  pool: HeadJudgePool | null;
  playingTeamId: string | null;
  // When the first throw was clicked (server clock, ms); null = no routine running.
  routineStartedAt: number | null;
  // Server time minus this device's time, ms.
  clockOffset: number;
  saveStatus: SaveStatus;
  onSelectTeam: (teamId: string) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const running = routineStartedAt !== null;

  // Redraw the timer while a routine is running. The time itself comes from the
  // start time, so it is right whenever it's drawn.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!running) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [running]);
  const elapsed = running && now !== null ? formatElapsed(elapsedMs(routineStartedAt, now, clockOffset)) : '0:00';

  if (!pool) return <p className="text-sm text-gray-500">Choose a playing pool on the Pools tab.</p>;

  // Group judges by category, in the order the columns use.
  const judgesSorted = [...pool.judges].sort(
    (a, b) => a.categoryType.localeCompare(b.categoryType) || a.name.localeCompare(b.name)
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">{pool.divisionName}</div>
          <h2 className="text-3xl font-bold">
            {pool.roundName} · Pool {pool.letter}
          </h2>
        </div>
        <div className="text-right">
          <div className="font-mono text-6xl font-bold tabular-nums">
            {elapsed}
            <span className="text-3xl font-normal text-gray-500"> / {formatElapsed(pool.routineSeconds * 1000)}</span>
          </div>
          <div className="text-xs text-gray-500">
            Routine time since first throw
            {saveStatus === 'saving' && <span className="ml-2 text-gray-400">Saving…</span>}
            {saveStatus === 'retrying' && <span className="ml-2 font-medium text-amber-700">Not saved yet, retrying</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {running ? (
          // The routine is under way; this button is for the next team once the judges are done.
          <button
            type="button"
            disabled
            className="min-h-48 cursor-not-allowed rounded-lg bg-gray-300 p-6 text-2xl font-bold text-gray-600"
          >
            Wait for Judges to finish. Once all the judges are finished, this button will allow you to go to the next team.
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={playingTeamId === null}
            className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg bg-green-600 p-6 text-3xl font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-green-600"
          >
            Click on First Throw
            {playingTeamId === null && <span className="text-base font-normal">Choose the playing team first</span>}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg bg-red-600 p-6 text-white hover:bg-red-700"
        >
          <span className="text-3xl font-bold">Cancel Routine</span>
          <span className="text-base">Only press if need to restart or something went wrong.</span>
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">Teams</h3>
          {running && <p className="text-xs text-gray-500">A routine is running. Cancel it to switch teams.</p>}
          <ol className="flex flex-col gap-1">
            {pool.teams.map((team, i) => {
              const current = team.id === playingTeamId;
              return (
                <li key={team.id}>
                  <button
                    type="button"
                    onClick={() => !current && onSelectTeam(team.id)}
                    // The team can't be switched while its routine is running.
                    disabled={running}
                    aria-pressed={current}
                    className={`flex w-full items-center gap-3 rounded border px-3 py-3 text-left text-xl ${
                      current
                        ? 'border-green-500 bg-green-100 text-black'
                        : running
                          ? 'cursor-not-allowed border-gray-300 opacity-50'
                          : 'cursor-pointer border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-gray-400">{i + 1}.</span>
                    <span className="flex-1">{teamName(team)}</span>
                    {current && <span className="text-sm font-medium text-green-800">Now playing</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">Judges</h3>
          {judgesSorted.length === 0 ? (
            <p className="text-sm text-gray-500">No judges set for this pool.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {judgesSorted.map((judge) => (
                <li
                  key={judge.playerId}
                  className="flex items-center justify-between gap-3 rounded border border-gray-200 px-3 py-2.5 text-base"
                >
                  <span>{judge.name}</span>
                  <span className="text-[11.2px] text-gray-500">
                    {JUDGE_CATEGORY_LABELS[judge.categoryType] ?? judge.categoryType}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Results</h3>
        <PoolResults pool={pool} />
      </section>
    </div>
  );
}
