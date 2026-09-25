// The judge score graph's line: every score adds a bump at its moment and the
// line is all the bumps added together, so several medium scores close together
// stack into one tall hill while scores far apart stay separate.

// A score `s` at `t` seconds into the routine.
export type CurveScore = { t: number; s: number };

// 'smooth': the bump is centred on the score (reviewing a finished routine).
// 'fade': the score jumps the line and its effect fades (looks back only).
export type CurveShape = 'smooth' | 'fade';

// How much of a score reaches `d` seconds away from it (1 at the score itself).
export function bumpWeight(shape: CurveShape, spread: number, d: number): number {
  if (shape === 'smooth') {
    const z = d / spread;
    return Math.exp(-0.5 * z * z);
  }
  return d >= 0 ? Math.exp(-d / spread) : 0;
}

export function scoreCurve(
  scores: readonly CurveScore[],
  { duration, spread, shape, step = 0.5 }: { duration: number; spread: number; shape: CurveShape; step?: number }
): { ts: number[]; ys: number[] } {
  const count = Math.round(duration / step) + 1;
  const ts: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i * step;
    let y = 0;
    for (const score of scores) y += score.s * bumpWeight(shape, spread, t - score.t);
    ts.push(t);
    ys.push(y);
  }
  return { ts, ys };
}

// A round axis step (1, 2, 5, 10, ...) at or above `raw`.
export function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

// The value range to draw: always includes zero and at least one step each way.
export function axisRange(
  maxY: number,
  minY: number
): { lo: number; hi: number; step: number } {
  const step = niceStep(Math.max(1, (maxY - minY) * 1.1) / 5);
  return {
    step,
    hi: Math.max(step, Math.ceil((maxY * 1.05) / step) * step),
    lo: Math.min(-step, Math.floor((minY * 1.05) / step) * step),
  };
}
