// The judge score graph's line: every score adds a bump at its moment and the
// line is all the bumps added together, so several medium scores close together
// stack into one tall hill while scores far apart stay separate.

// A score `s` at `t` seconds into the routine. `color` is the colour of its dot
// on the graph (green or red by sign if not given) and `dotScale` makes that
// dot bigger or smaller than its size for the score (1 if not given). An `id`
// lets the graph say which dot was picked, and a `label` names it. An `unused`
// score is past the routine's limit of positive scores (see limitScores): it is
// still drawn, but grayed out and left out of the baseline.
export type CurveScore = {
  id?: string;
  label?: string;
  t: number;
  s: number;
  color?: string;
  dotScale?: number;
  unused?: boolean;
};

// How many positive scores a routine may count: one per `secondsPerScore` of
// its length (15 = 4 a minute, 12 in a 3:00 routine). 0 means no limit.
export const scoreLimit = (routineSeconds: number, secondsPerScore: number): number =>
  secondsPerScore > 0 ? Math.floor(routineSeconds / secondsPerScore) : Infinity;

// The scores with the ones past the limit marked unused: the most valuable
// positive scores count (equal ones: the earlier first), wherever in the
// routine they are; negative scores always count.
export function limitScores<T extends CurveScore>(scores: readonly T[], routineSeconds: number, secondsPerScore: number): T[] {
  const limit = scoreLimit(routineSeconds, secondsPerScore);
  const positive = scores.map((s, i) => ({ s, i })).filter(({ s }) => s.s > 0);
  if (positive.length <= limit) return [...scores];
  positive.sort((a, b) => b.s.s - a.s.s || a.s.t - b.s.t || a.i - b.i);
  const dropped = new Set(positive.slice(limit).map(({ i }) => i));
  return scores.map((s, i) => (dropped.has(i) ? { ...s, unused: true } : s));
}

// The scores that count toward the baseline.
export const countedScores = <T extends CurveScore>(scores: readonly T[]): T[] => scores.filter((s) => !s.unused);

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

// The line the judge screens draw, and the baseline estimate measures: the same
// shape and spread everywhere, so the number matches the picture.
export const CURVE_SHAPE: CurveShape = 'smooth';
export const CURVE_SPREAD = 4;

// The line's height at one moment.
export function curveValueAt(scores: readonly CurveScore[], shape: CurveShape, spread: number, t: number): number {
  let y = 0;
  for (const score of scores) y += score.s * bumpWeight(shape, spread, t - score.t);
  return y;
}

// The line sampled about every `step` seconds from `from` to `to` (the whole
// routine unless a zoomed window is given). The points run exactly from `from`
// to `to`, so the spacing can be a little different from `step`.
export function scoreCurve(
  scores: readonly CurveScore[],
  {
    duration,
    spread,
    shape,
    step = 0.5,
    from = 0,
    to = duration,
  }: { duration: number; spread: number; shape: CurveShape; step?: number; from?: number; to?: number }
): { ts: number[]; ys: number[] } {
  const count = Math.max(2, Math.round((to - from) / step) + 1);
  const spacing = (to - from) / (count - 1);
  const ts: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = from + i * spacing;
    ts.push(t);
    ys.push(curveValueAt(scores, shape, spread, t));
  }
  return { ts, ys };
}

// A height with its size raised to `power` and its sign kept: power 1 leaves it
// alone, above 1 makes tall values count for more.
const emphasise = (y: number, power: number) => (y === 0 ? 0 : Math.sign(y) * Math.pow(Math.abs(y), power));

// The area under the line from `from` to `to` (green above zero adds, red
// below subtracts), with each height first passed through `emphasise`.
// A trapezoid sum with points every `step` seconds.
export function curveArea(
  scores: readonly CurveScore[],
  {
    shape,
    spread,
    from,
    to,
    power,
    step = 0.1,
  }: { shape: CurveShape; spread: number; from: number; to: number; power: number; step?: number }
): number {
  if (scores.length === 0 || to <= from) return 0;
  const count = Math.max(2, Math.round((to - from) / step) + 1);
  const h = (to - from) / (count - 1);
  let previous = emphasise(curveValueAt(scores, shape, spread, from), power);
  let area = 0;
  for (let i = 1; i < count; i++) {
    const current = emphasise(curveValueAt(scores, shape, spread, from + i * h), power);
    area += ((previous + current) / 2) * h;
    previous = current;
  }
  return area;
}

// How far past the first and last note the area is measured: by 4 spreads a
// bump is down to 0.03% of its height, so every note's bump counts in full.
const AREA_MARGIN = 4 * CURVE_SPREAD;

// The score the computer suggests from the notes: the area under the whole
// curve, with heights raised to `power`, times `areaScale`. The area runs past
// the routine's start and end (and any note after its length), so when a note
// was taken doesn't change what it is worth: at power 1 the estimate is the
// notes' points added up. Above 1, notes close together (a tall hill) count for
// more. Dividing by spread x sqrt(2 pi) makes a note count its own weight.
// Rounded to 1 decimal.
export function baselineEstimate(
  scores: readonly CurveScore[],
  routineSeconds: number,
  { areaScale, power }: { areaScale: number; power: number }
): number {
  const times = scores.map((s) => s.t);
  const from = Math.min(0, ...times) - AREA_MARGIN;
  const to = Math.max(routineSeconds, ...times) + AREA_MARGIN;
  const area = curveArea(scores, { shape: CURVE_SHAPE, spread: CURVE_SPREAD, from, to, power });
  const value = (areaScale * area) / (CURVE_SPREAD * Math.sqrt(2 * Math.PI));
  return Math.round(value * 10) / 10 || 0;
}

// The simplest possible baseline: the notes' weights added straight up, no
// smoothing or timing - "how many points worth of notes did the judge take",
// not an estimate of where the curve would land. Used for Execution/Artistic
// Impression instead of baselineEstimate's area-under-the-curve (Difficulty
// still uses that - its notes' timing genuinely matters to the routine).
export function noteSum(scores: readonly CurveScore[]): number {
  return Math.round(scores.reduce((sum, s) => sum + s.s, 0) * 10) / 10 || 0;
}

// A value with its sign spelled out ("+12.3" / "−4.5"), for graph labels.
export const signed = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)}`;

export type CurveSegment = { fromIndex: number; toIndex: number; peakIndex: number; area: number };

// Splits a sampled curve (e.g. a team's combined curve - OtherCurve.ys, a
// fixed-step array, not raw notes) into contiguous runs above/below zero
// ("mountains" and "valleys"), each with its trapezoidal-integrated area
// (summed over the run's own samples - it doesn't chase the exact
// zero-crossing moment between two samples, which is only ever off by at most
// half a step's worth of area; fine for a contextual label, not a scored
// value) and the index of its tallest/deepest point, for placing that label.
// Runs under `minArea` are left out entirely - too small to be worth labelling.
export function curveSegments(ys: readonly number[], step: number, minArea = 0.5): CurveSegment[] {
  const segments: CurveSegment[] = [];
  let i = 0;
  while (i < ys.length) {
    if (ys[i] === 0) {
      i++;
      continue;
    }
    const sign = Math.sign(ys[i]);
    let j = i;
    while (j < ys.length && ys[j] !== 0 && Math.sign(ys[j]) === sign) j++;
    let area = j - i === 1 ? ys[i] * step : 0;
    for (let k = i; k < j - 1; k++) area += ((ys[k] + ys[k + 1]) / 2) * step;
    if (Math.abs(area) >= minArea) {
      let peakIndex = i;
      for (let k = i + 1; k < j; k++) if (Math.abs(ys[k]) > Math.abs(ys[peakIndex])) peakIndex = k;
      segments.push({ fromIndex: i, toIndex: j - 1, peakIndex, area: Math.round(area * 10) / 10 });
    }
    i = j;
  }
  return segments;
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
