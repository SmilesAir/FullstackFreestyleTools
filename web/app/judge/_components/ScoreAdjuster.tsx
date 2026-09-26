'use client';

import type { ReactNode } from 'react';

// The score adjustment buttons, in percent: a major and a minor step each way.
const ADJUST_STEPS = [-10, -1, 1, 10];
const MAJOR_STEP = 10;

// One triangle pointing up or down, or two stacked for the major step.
function AdjustButton({
  step,
  onAdjust,
  disabled,
  large,
  fill,
}: {
  step: number;
  onAdjust: (step: number) => void;
  disabled?: boolean;
  large?: boolean;
  fill?: boolean;
}) {
  const up = step > 0;
  const major = Math.abs(step) >= MAJOR_STEP;
  const paths = major
    ? up
      ? ['M12 2 L21 11 H3 Z', 'M12 12 L21 21 H3 Z']
      : ['M12 22 L3 13 H21 Z', 'M12 12 L3 3 H21 Z']
    : [up ? 'M12 4 L21 18 H3 Z' : 'M12 20 L3 6 H21 Z'];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onAdjust(step)}
      aria-label={`${up ? 'Raise' : 'Lower'} score ${Math.abs(step)}%`}
      title={`${up ? '+' : '−'}${Math.abs(step)}%`}
      className={`flex cursor-pointer items-center justify-center border-2 transition active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${
        fill ? 'h-full min-w-0 flex-1 rounded-md' : `rounded-lg ${large ? 'h-20 w-16' : 'h-14 w-12'}`
      } ${up ? 'border-green-600 text-green-700' : 'border-red-600 text-red-700'}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`fill-current ${fill ? 'w-3/5 max-w-10' : large ? 'w-9' : 'w-6'}`}>
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </button>
  );
}

// The lower buttons, the score (`children`), then the raise buttons.
// `large` draws bigger buttons where there is room for them. `fill` makes the
// buttons share the width and height of the parent instead, with no score
// between them, and leaves out the major step.
export function ScoreAdjuster({
  onAdjust,
  disabled,
  large,
  fill,
  children,
}: {
  onAdjust: (step: number) => void;
  disabled?: boolean;
  large?: boolean;
  fill?: boolean;
  children?: ReactNode;
}) {
  // Filling the parent is for small spaces, so only the minor step is offered.
  const steps = fill ? ADJUST_STEPS.filter((step) => Math.abs(step) < MAJOR_STEP) : ADJUST_STEPS;
  return (
    // No text selection or double-tap zoom when the buttons are pressed quickly.
    <div className={`touch-manipulation select-none items-center ${fill ? 'flex h-full w-full gap-1' : 'flex shrink-0 gap-2'}`}>
      {steps.filter((step) => step < 0).map((step) => (
        <AdjustButton key={step} step={step} onAdjust={onAdjust} disabled={disabled} large={large} fill={fill} />
      ))}
      {children}
      {steps.filter((step) => step > 0).map((step) => (
        <AdjustButton key={step} step={step} onAdjust={onAdjust} disabled={disabled} large={large} fill={fill} />
      ))}
    </div>
  );
}
