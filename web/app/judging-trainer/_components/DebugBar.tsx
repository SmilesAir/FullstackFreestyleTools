'use client';

import Link from 'next/link';
import type { NoteCategory } from '@/lib/judging';

export type TrainerView = 'guide' | NoteCategory | 'results' | 'description';

const VIEWS: { id: TrainerView; label: string }[] = [
  { id: 'guide', label: 'Start Guide' },
  { id: 'Diff', label: 'Diff Judge' },
  { id: 'AI', label: 'AI Judge' },
  { id: 'Ex', label: 'Ex Judge' },
  { id: 'results', label: 'Results' },
  { id: 'description', label: 'FPA2027 Description' },
];

const button =
  'cursor-pointer rounded border px-2.5 py-1 font-mono text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40';
const plain = `${button} border-slate-500 bg-slate-700 text-slate-100 hover:bg-slate-600`;

// The trainer's controls, styled like a debug toolbar: a fresh test event, which
// screen to show, ending the running routine early (routines are started from
// the results table), and where things stand.
export function DebugBar({
  view,
  onView,
  onNewEvent,
  canEndEarly,
  onEndEarly,
  status,
}: {
  view: TrainerView;
  onView: (view: TrainerView) => void;
  onNewEvent: () => void;
  canEndEarly: boolean;
  onEndEarly: () => void;
  status: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-600 bg-slate-800 px-3 py-2 text-slate-100">
      <span className="font-mono text-xs font-semibold uppercase tracking-wide text-slate-400">Judging Trainer</span>

      <button type="button" onClick={onNewEvent} className={plain}>
        New test event
      </button>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Screen">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={view === v.id}
            onClick={() => onView(v.id)}
            className={
              view === v.id ? `${button} border-sky-400 bg-sky-500 text-white` : plain
            }
          >
            {v.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={!canEndEarly}
        onClick={onEndEarly}
        title="Stop the routine now so the judge can enter the score"
        className={`${button} border-amber-500 bg-amber-700 text-white hover:bg-amber-600`}
      >
        End early
      </button>

      <span className="font-mono text-xs tabular-nums text-slate-300">{status}</span>

      <Link href="/control-panel" className="ml-auto text-xs text-sky-300 underline">
        ← Control Panel
      </Link>
    </div>
  );
}
