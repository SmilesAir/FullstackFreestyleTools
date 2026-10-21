'use client';

import { adjustedScore } from '@/lib/judging-estimate';
import { ScoreAdjuster } from './ScoreAdjuster';

// A routine's score as a square next to its graph (it fills the square it is
// given): the judge's score, its baseline and change, and the buttons that
// change it. Before a score is submitted it shows the baseline estimate
// instead, with buttons only when a score can be entered from here (`canEnter`,
// the backup for a routine whose score never got in): the first press submits.
export function ScoreCard({
  estimate,
  unrestricted = null,
  submitted,
  percent,
  status,
  onAdjust,
  canEnter = false,
}: {
  estimate: number;
  // The baseline with every note counted, when the category limits its
  // positive notes (null = no limit): shown as Baseline / Unrestricted.
  unrestricted?: number | null;
  // The submitted baseline, or null before a score is submitted.
  submitted: { baseline: number } | null;
  // The change in percent now shown (it may not be saved yet).
  percent: number;
  // 'Not saved' when a change failed to save (saving itself is silent).
  status: string | null;
  onAdjust: (step: number) => void;
  canEnter?: boolean;
}) {
  // Before a score is in, a press already shows the score it will submit.
  const entering = !submitted && canEnter && percent !== 0;
  const limited = unrestricted !== null;
  return (
    <div className="flex h-full w-full flex-col gap-1 rounded border border-gray-300 p-1.5">
      <div className="flex flex-col items-center text-center leading-tight">
        <span className="text-[11px]">
          {submitted || entering ? 'Your score' : limited ? 'Baseline / Unrestricted' : 'Baseline estimate'}
        </span>
        <span className="font-mono text-2xl font-bold tabular-nums">
          {adjustedScore(submitted ? submitted.baseline : estimate, percent)}
          {!submitted && !entering && limited && (
            <span className="text-base font-normal text-gray-500"> / {unrestricted}</span>
          )}
        </span>
        <span className="text-[10px] text-gray-500">
          {submitted
            ? (status ??
              (limited
                ? `Baseline / Unrestricted ${submitted.baseline} / ${unrestricted} · ${percent}%`
                : `Baseline ${submitted.baseline} · ${percent}%`))
            : (status ?? (canEnter ? 'Not submitted. Press to enter' : 'Not submitted'))}
        </span>
      </div>
      {(submitted || canEnter) && (
        <div className="min-h-0 flex-1">
          <ScoreAdjuster fill onAdjust={onAdjust} />
        </div>
      )}
    </div>
  );
}
