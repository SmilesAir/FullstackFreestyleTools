'use client';

import type { NoteCategory } from '@/lib/judging';
import { useT } from '@/lib/i18n/client';
import { ControlPanelLink } from '@/app/_components/ControlPanelLink';

export type TrainerView = 'guide' | NoteCategory | 'results' | 'description';

const VIEWS: TrainerView[] = ['guide', 'Diff', 'AI', 'Ex', 'results', 'description'];

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
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-600 bg-slate-800 px-3 py-2 text-slate-100">
      <span className="font-mono text-xs font-semibold uppercase tracking-wide text-slate-400">{t.trainer.title}</span>

      <button type="button" onClick={onNewEvent} className={plain}>
        {t.trainer.newTestEvent}
      </button>

      <div className="flex flex-wrap gap-1" role="group" aria-label={t.trainer.screen}>
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => onView(v)}
            className={
              view === v ? `${button} border-sky-400 bg-sky-500 text-white` : plain
            }
          >
            {t.trainer.views[v]}
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={!canEndEarly}
        onClick={onEndEarly}
        title={t.trainer.endEarlyTip}
        className={`${button} border-amber-500 bg-amber-700 text-white hover:bg-amber-600`}
      >
        {t.trainer.endEarly}
      </button>

      <span className="font-mono text-xs tabular-nums text-slate-300">{status}</span>

      <ControlPanelLink label={t.headJudge.backToControlPanel} className="ml-auto" linkClassName="text-xs text-sky-300 underline" />
    </div>
  );
}
