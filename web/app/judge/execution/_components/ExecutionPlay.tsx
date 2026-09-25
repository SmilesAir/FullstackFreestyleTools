'use client';

import { useEffect, useState } from 'react';
import { EXECUTION_NOTES, type JudgeState } from '@/lib/judging';
import { elapsedMs, formatElapsed } from '@/lib/head-judge-state';
import type { SaveStatus } from '@/app/judge/_components/useJudgeNotes';

// Worst to best, coloured so they can be pressed without reading.
const STYLE: Record<string, string> = {
  large_error: 'bg-red-700 text-white',
  medium_error: 'bg-orange-600 text-white',
  minor_error: 'bg-amber-400 text-black',
  average_completion: 'bg-slate-500 text-white',
  clean_completion: 'bg-green-600 text-white',
};

export function ExecutionPlay({
  state,
  clockOffset,
  canNote,
  saveStatus,
  onNote,
  onUndo,
}: {
  state: JudgeState;
  clockOffset: number;
  canNote: boolean;
  saveStatus: SaveStatus;
  onNote: (noteType: string) => void;
  onUndo: () => void;
}) {
  const running = state.routineStartedAt !== null;

  // Redraw the timer while a routine is running; the time itself comes from the
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
  const elapsed =
    running && now !== null ? formatElapsed(elapsedMs(state.routineStartedAt, now, clockOffset)) : '0:00';

  // Counts and the last note only mean something while a routine is running.
  const notes = running ? state.notes : [];
  const counts = new Map<string, number>();
  for (const n of notes) counts.set(n.noteType, (counts.get(n.noteType) ?? 0) + 1);
  const last = notes[notes.length - 1];
  const lastLabel = last ? EXECUTION_NOTES.find((n) => n.type === last.noteType)?.label : null;

  const waiting = !state.poolTitle
    ? 'No pool is playing yet.'
    : !state.teamName
      ? 'Waiting for the head judge to choose the team.'
      : !running
        ? 'Waiting for the head judge to start the routine.'
        : null;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm text-gray-500">{state.poolTitle ?? 'No pool playing'}</div>
          <div className="text-2xl font-bold">{state.teamName ?? '(no team up)'}</div>
        </div>
        <div className="text-right font-mono text-3xl font-bold tabular-nums">
          {elapsed}
          <span className="text-lg font-normal text-gray-500"> / {formatElapsed(state.routineSeconds * 1000)}</span>
        </div>
      </div>

      {waiting && <p className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600">{waiting}</p>}

      <div className="flex flex-col gap-3">
        {EXECUTION_NOTES.map((note) => (
          <button
            key={note.type}
            type="button"
            disabled={!canNote}
            onClick={() => onNote(note.type)}
            className={`flex min-h-24 w-full cursor-pointer items-center justify-between gap-4 rounded-xl px-6 text-left text-2xl font-bold shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${STYLE[note.type]}`}
          >
            <span>{note.label}</span>
            <span className="min-w-8 text-right font-mono text-xl tabular-nums opacity-80">
              {counts.get(note.type) ? `×${counts.get(note.type)}` : ''}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="min-w-0 text-gray-600">
          {last && lastLabel ? (
            <>
              Last: <span className="font-medium text-foreground">{lastLabel}</span> at{' '}
              {formatElapsed(Math.max(0, last.notedAt - (state.routineStartedAt ?? last.notedAt)))}
            </>
          ) : (
            'No notes yet this routine'
          )}
          {saveStatus === 'saving' && <span className="ml-2 text-gray-400">Saving…</span>}
          {saveStatus === 'retrying' && <span className="ml-2 font-medium text-amber-700">Not saved yet, retrying</span>}
        </div>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canNote || !last}
          className="shrink-0 cursor-pointer rounded border border-gray-300 px-4 py-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Undo last note
        </button>
      </div>
    </div>
  );
}
