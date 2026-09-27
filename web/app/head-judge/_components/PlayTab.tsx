'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { JUDGE_CATEGORY_LABELS } from '@/lib/event-creator';
import { teamName, type HeadJudgePool } from '@/lib/head-judge';
import { elapsedMs, formatElapsed } from '@/lib/head-judge-state';
import { CONNECTED_INTERVALS, JUDGE_POLL_MS, WEAK_SECONDS, type PollMode } from '@/lib/poll-intervals';
import { PoolResults } from './PoolResults';
import type { SaveStatus } from './usePlayState';

const HOLD_MS = 1000;

// Whether a judge's screen is reaching the server: how long ago it last asked
// for news (undefined = never), against how often it asks.
function connectionOf(secondsAgo: number | undefined, mode: PollMode) {
  if (secondsAgo === undefined || secondsAgo > WEAK_SECONDS) {
    return { dot: 'bg-gray-400', text: 'Not connected', tone: 'text-gray-500' };
  }
  if (secondsAgo <= (CONNECTED_INTERVALS * JUDGE_POLL_MS[mode]) / 1000) {
    return { dot: 'bg-green-500', text: 'Connected', tone: 'text-gray-600' };
  }
  return { dot: 'bg-amber-500', text: `Weak: ${secondsAgo} s ago`, tone: 'text-amber-700' };
}

// A button that only acts once it has been held down for HOLD_MS (mouse, touch,
// or Enter/Space), so a stray tap can't set it off. A darker fill sweeps across
// while it's held; letting go early does nothing.
const HOLD_COLORS = {
  red: { button: 'bg-red-600 hover:bg-red-700', fill: 'bg-red-900' },
  blue: { button: 'bg-blue-600 hover:bg-blue-700', fill: 'bg-blue-900' },
};

// Shown instead of a colour while the button has nothing to act on.
const DISABLED_BUTTON = 'cursor-not-allowed bg-gray-300 text-gray-600';

function HoldButton({
  onConfirm,
  color,
  disabled = false,
  children,
}: {
  onConfirm: () => void;
  color: keyof typeof HOLD_COLORS;
  // Greyed out and does nothing.
  disabled?: boolean;
  children: ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    if (disabled || timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm();
    }, HOLD_MS);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => stop, []);

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        if (e.button === 0) start();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          start();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') stop();
      }}
      onBlur={stop}
      // A long press on a phone would otherwise open the text menu.
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      className={`relative flex min-h-48 touch-manipulation select-none flex-col items-center justify-center gap-3 overflow-hidden rounded-lg p-6 [-webkit-touch-callout:none] ${
        disabled ? DISABLED_BUTTON : `cursor-pointer text-white ${HOLD_COLORS[color].button}`
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-0 origin-left ${HOLD_COLORS[color].fill}`}
        style={{
          transform: holding ? 'scaleX(1)' : 'scaleX(0)',
          transition: `transform ${holding ? HOLD_MS : 150}ms linear`,
        }}
      />
      <span className="relative flex flex-col items-center gap-3">{children}</span>
    </button>
  );
}

// The pool being played: where it is, the routine timer and controls, who is
// on, and how it's going.
export function PlayTab({
  eventId,
  active,
  pool,
  playingTeamId,
  routineStartedAt,
  finishedJudges,
  clockOffset,
  saveStatus,
  presence,
  mode,
  onSelectTeam,
  onStart,
  onCancel,
  onNextTeam,
  restorableRoutineId,
  onRestore,
}: {
  eventId: string;
  // This tab is showing, so the results are read live.
  active: boolean;
  pool: HeadJudgePool | null;
  playingTeamId: string | null;
  // When the first throw was clicked (server clock, ms); null = no routine running.
  routineStartedAt: number | null;
  // Judges (player ids) who have submitted their score for the running routine.
  finishedJudges: string[];
  // Server time minus this device's time, ms.
  clockOffset: number;
  saveStatus: SaveStatus;
  // Seconds since each judge's screen (player id) last asked the server for news.
  presence: Record<string, number>;
  // Which database answers, which sets how often the judges' screens ask.
  mode: PollMode;
  onSelectTeam: (teamId: string) => void;
  onStart: () => void;
  onCancel: () => void;
  // Ends the routine as played and puts the given team up (null = the pool is done).
  onNextTeam: (nextTeamId: string | null) => void;
  // The playing team's cancelled routine that still has judges' notes or
  // scores, when no routine is running (null = nothing to restore).
  restorableRoutineId: string | null;
  onRestore: (routineId: string) => void;
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
  const locked = pool.locked;

  // Every judge in the pool has submitted their score: time for the next team.
  const allFinished = running && pool.judges.every((j) => finishedJudges.includes(j.playerId));
  const playingIndex = pool.teams.findIndex((t) => t.id === playingTeamId);
  const nextTeam = playingIndex === -1 ? null : (pool.teams[playingIndex + 1] ?? null);

  // Group judges by category, in the order the columns use.
  const judgesSorted = [...pool.judges].sort(
    (a, b) => a.categoryType.localeCompare(b.categoryType) || a.name.localeCompare(b.name)
  );

  return (
    <div className="flex flex-col gap-6">
      {locked && (
        <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          🔒 This pool is locked. Unlock it on the Pools tab to make changes.
        </p>
      )}
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
        {running && allFinished ? (
          // All the judges are done: on to the next team.
          <button
            type="button"
            onClick={() => onNextTeam(nextTeam?.id ?? null)}
            className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg bg-blue-600 p-6 text-3xl font-bold text-white hover:bg-blue-700"
          >
            {nextTeam ? 'Click to move to the next team' : 'Click to finish the last team'}
            {nextTeam && <span className="text-base font-normal">{teamName(nextTeam)}</span>}
          </button>
        ) : running ? (
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
            disabled={playingTeamId === null || locked}
            className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg bg-green-600 p-6 text-3xl font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-green-600"
          >
            Click on First Throw
            {playingTeamId === null && <span className="text-base font-normal">Choose the playing team first</span>}
            {playingTeamId !== null && locked && <span className="text-base font-normal">This pool is locked</span>}
          </button>
        )}
        {!running && restorableRoutineId ? (
          // The team's last routine was cancelled but the judges' notes or
          // scores are still there: offer to bring them back.
          <HoldButton key="restore" color="blue" onConfirm={() => onRestore(restorableRoutineId)} disabled={locked}>
            <span className="text-3xl font-bold">Restore Cancelled Routine Scores</span>
            <span className="text-base">This team&apos;s last routine was cancelled. Its judges&apos; scores are hidden.</span>
            <span className="text-sm font-semibold uppercase tracking-wide opacity-90">Hold for 1 second</span>
          </HoldButton>
        ) : (
          // Nothing to cancel until a routine is running (and nothing hidden to bring back).
          <HoldButton key="cancel" color="red" onConfirm={onCancel} disabled={!running}>
            <span className="text-3xl font-bold">Cancel Routine</span>
            <span className="text-base">Only press if need to restart or something went wrong.</span>
            <span className="text-sm font-semibold uppercase tracking-wide opacity-90">Hold for 1 second</span>
          </HoldButton>
        )}
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
              {judgesSorted.map((judge) => {
                // Light green once this judge has submitted their score for the running routine.
                const finished = running && finishedJudges.includes(judge.playerId);
                const link = connectionOf(presence[judge.playerId], mode);
                return (
                  <li
                    key={judge.playerId}
                    className={`flex items-center justify-between gap-3 rounded border px-3 py-2.5 text-base ${
                      finished ? 'border-green-500 bg-green-100 text-black' : 'border-gray-200'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${link.dot}`}
                      />
                      {judge.name}
                      <span className={`text-xs ${link.tone}`}>{link.text}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      {finished && <span className="text-sm font-semibold text-green-800">Finished</span>}
                      <span className={`text-[11.2px] ${finished ? 'text-green-900' : 'text-gray-500'}`}>
                        {JUDGE_CATEGORY_LABELS[judge.categoryType] ?? judge.categoryType}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-lg font-semibold">Results</h3>
        <PoolResults
          key={pool.key}
          eventId={eventId}
          pool={pool}
          active={active}
          refreshKey={`${routineStartedAt}:${finishedJudges.join()}`}
        />
      </section>
    </div>
  );
}
