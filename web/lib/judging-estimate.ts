// The baseline estimate worked out from a judge's saved notes. The server uses
// this when a score is submitted, and it makes the same points from the notes
// as the graph does on the judge's screen (judge/_components/noteScores.ts),
// so the number the judge saw is the number that is stored.

import { notePoints, type NoteCategory } from './judging';
import { baselineEstimate, countedScores, limitScores, noteSum, type CurveScore } from './score-curve';

// The estimate from these points: Execution/Artistic Impression add the notes'
// weights straight up; Difficulty is the area-under-the-curve estimate (timing
// matters there).
export function estimateFromScores(
  scores: readonly CurveScore[],
  routineSeconds: number,
  estimate: { areaScale: number; power: number },
  category: NoteCategory
): number {
  return category === 'Diff' ? baselineEstimate(scores, routineSeconds, estimate) : noteSum(scores);
}

// The baseline counts only the notes within the routine's limit of positive
// notes (see limitScores); `unrestricted` is what it would be with every note.
export function estimatesOf(
  scores: readonly CurveScore[],
  routineSeconds: number,
  estimate: { areaScale: number; power: number },
  category: NoteCategory
): { baseline: number; unrestricted: number } {
  return {
    baseline: estimateFromScores(countedScores(scores), routineSeconds, estimate, category),
    unrestricted: estimateFromScores(scores, routineSeconds, estimate, category),
  };
}

export function estimateFromNotes(
  notes: readonly { noteType: string; notedAt: number; lineValue?: number | null; multiplier?: number | null }[],
  routineStartedAt: number,
  routineSeconds: number,
  noteWeights: Record<string, number>,
  estimate: { areaScale: number; power: number },
  category: NoteCategory,
  secondsPerScore: number
): { baseline: number; unrestricted: number } {
  const points = notes.map((n) => ({
    t: Math.max(0, (n.notedAt - routineStartedAt) / 1000),
    s: notePoints(n, noteWeights),
  }));
  return estimatesOf(limitScores(points, routineSeconds, secondsPerScore), routineSeconds, estimate, category);
}

// The final score: the baseline with the judge's percentage change, to 2 decimals
// (the same rounding the score dialog shows). The change is a percentage of the
// baseline's size, so a positive change always raises the score, even when the
// baseline is below zero. A baseline of 0 has no size, so there each percent is
// a tenth of a point instead (10% = 1 point, 1% = 0.1).
const ZERO_BASELINE_SIZE = 10;
export function adjustedScore(baseline: number, adjustPercent: number): number {
  const size = baseline === 0 ? ZERO_BASELINE_SIZE : Math.abs(baseline);
  return Math.round((baseline + (size * adjustPercent) / 100) * 100) / 100 || 0;
}
