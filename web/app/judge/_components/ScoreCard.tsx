'use client';

import { adjustedScore } from '@/lib/judging-estimate';
import { ScoreAdjuster } from './ScoreAdjuster';
import { useT } from '@/lib/i18n/client';

// A routine's score as a square next to its graph (it fills the square it is
// given): the judge's score, its baseline and change, and the buttons that
// change it. Before a score is submitted it shows the baseline estimate
// instead, with buttons only when a score can be entered from here (`canEnter`,
// the backup for a routine whose score never got in): the first press submits.
export function ScoreCard({
  estimate,
  unit,
  unrestricted = null,
  submitted,
  percent,
  status,
  onAdjust,
  canEnter = false,
}: {
  estimate: number;
  // What one ordinary note is worth (see adjustedScore).
  unit: number;
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
  const t = useT();
  // Before a score is in, a press already shows the score it will submit.
  const entering = !submitted && canEnter && percent !== 0;
  const limited = unrestricted !== null;
  return (
    <div className="flex h-full w-full flex-col gap-1 rounded border border-gray-300 p-1.5">
      <div className="flex flex-col items-center text-center leading-tight">
        <span className="text-[11px]">
          {submitted || entering ? t.judging.yourScore : limited ? t.judging.baselineUnrestricted : t.judging.baselineEstimate}
        </span>
        <span className="font-mono text-2xl font-bold tabular-nums">
          {adjustedScore(submitted ? submitted.baseline : estimate, percent, unit)}
          {!submitted && !entering && limited && (
            <span className="text-base font-normal text-gray-500"> / {unrestricted}</span>
          )}
        </span>
        <span className="text-[10px] text-gray-500">
          {submitted
            ? (status ??
              (limited
                ? t.judging.baselineUnrestrictedValues(submitted.baseline, unrestricted, percent)
                : t.judging.baselineValue(submitted.baseline, percent)))
            : (status ?? (canEnter ? t.judging.notSubmittedPress : t.judging.notSubmitted))}
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
