'use client';

import { useMemo, useState } from 'react';
import { EXECUTION_NOTES, type JudgeState } from '@/lib/judging';
import { formatElapsed } from '@/lib/head-judge-state';
import type { CurveScore } from '@/lib/score-curve';
import { ScoreGraph } from '@/app/judge/_components/ScoreGraph';

// The judge's notes for the routine as a graph and a list, and (later) the
// suggested score to adjust and submit.
export function ExecutionReview({ state }: { state: JudgeState }) {
  const routine = state.notesRoutine;
  const [myScore, setMyScore] = useState('');

  const scores = useMemo<CurveScore[]>(() => {
    if (!routine) return [];
    return state.notes.map((n) => ({
      t: Math.max(0, (n.notedAt - routine.startedAt) / 1000),
      s: EXECUTION_NOTES.find((e) => e.type === n.noteType)?.value ?? 0,
    }));
  }, [state.notes, routine]);

  if (!routine) {
    return (
      <p className="mx-auto max-w-xl text-sm text-gray-500">
        No notes yet. Notes you take on the Play tab appear here as a graph.
      </p>
    );
  }

  // Whole 30-second steps, and long enough to hold a late note.
  const latest = scores.reduce((m, s) => Math.max(m, s.t), 0);
  const duration = Math.max(30, Math.ceil(Math.max(routine.routineSeconds, latest) / 30) * 30);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <div className="text-sm text-gray-500">{state.routineStartedAt === routine.startedAt ? 'Routine in progress' : 'Last routine'}</div>
        <div className="text-2xl font-bold">{routine.teamName ?? '(team)'}</div>
      </div>

      <ScoreGraph scores={scores} duration={duration} />

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Notes ({state.notes.length})</h2>
        {state.notes.length === 0 ? (
          <p className="text-sm text-gray-500">No notes were taken this routine.</p>
        ) : (
          <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {state.notes.map((n) => (
              <li key={n.id} className="flex items-baseline justify-between gap-3 border-b border-gray-200 py-1">
                <span>{EXECUTION_NOTES.find((e) => e.type === n.noteType)?.label ?? n.noteType}</span>
                <span className="font-mono text-sm tabular-nums text-gray-500">
                  {formatElapsed(Math.max(0, n.notedAt - routine.startedAt))}
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-gray-500">
          Graph heights use provisional note values (Large Error −3, Medium −2, Minor −1, Average +1, Clean +2) until the
          scoring rules are set.
        </p>
      </section>

      <section className="flex flex-col gap-3 rounded border border-gray-300 p-4">
        <h2 className="text-lg font-semibold">Score</h2>
        <div className="text-sm text-gray-600">
          Suggested score: <span className="font-medium text-foreground">not defined yet</span>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Your score
          <input
            type="number"
            inputMode="decimal"
            value={myScore}
            onChange={(e) => setMyScore(e.target.value)}
            className="w-40 rounded border border-gray-300 bg-transparent px-2 py-1"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded bg-gray-800 px-4 py-2 text-white opacity-40"
          >
            Submit
          </button>
          <span className="text-xs text-gray-500">Submitting scores is coming later.</span>
        </div>
      </section>
    </div>
  );
}
