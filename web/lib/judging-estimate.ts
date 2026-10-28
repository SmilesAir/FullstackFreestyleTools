// The baseline estimate worked out from a judge's saved notes. The server uses
// this when a score is submitted, and it makes the same points from the notes
// as the graph does on the judge's screen (judge/_components/noteScores.ts),
// so the number the judge saw is the number that is stored.

import { notePoints, notesFromStart, type NoteCategory } from './judging';
import { baselineEstimate, countedScores, limitScores, noteSum, type CurveScore } from './score-curve';

// The estimate from these points: Execution/Artistic Impression add the notes'
// weights straight up; Difficulty is the area-under-the-curve estimate (timing
// matters there).
export function estimateFromScores(
  scores: readonly CurveScore[],
  routineSeconds: number,
  estimate: { areaScale: number },
  category: NoteCategory
): number {
  return category === 'Diff' ? baselineEstimate(scores, routineSeconds, estimate) : noteSum(scores);
}

// The baseline counts only the notes within the routine's limit of positive
// notes (see limitScores); `unrestricted` is what it would be with every note.
export function estimatesOf(
  scores: readonly CurveScore[],
  routineSeconds: number,
  estimate: { areaScale: number },
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
  estimate: { areaScale: number },
  category: NoteCategory,
  secondsPerScore: number
): { baseline: number; unrestricted: number } {
  const points = notesFromStart(notes, routineStartedAt).map((n) => ({
    t: (n.notedAt - routineStartedAt) / 1000,
    s: notePoints(n, noteWeights),
  }));
  return estimatesOf(limitScores(points, routineSeconds, secondsPerScore), routineSeconds, estimate, category);
}

// The final score: the baseline with the judge's percentage change, to 2 decimals
// (the same rounding the score dialog shows). The change is a percentage of the
// baseline's size, so a positive change always raises the score, even when the
// baseline is below zero. Near 0 the baseline has (almost) no size, so the size
// is never less than ten of the category's ordinary notes (`unit`, see
// adjustUnit): there 10% is one such note and 1% a tenth of one, with no jump
// between a baseline of exactly 0 and one just off it.
export function adjustedScore(baseline: number, adjustPercent: number, unit: number): number {
  const size = Math.max(Math.abs(baseline), 10 * unit);
  return Math.round((baseline + (size * adjustPercent) / 100) * 100) / 100 || 0;
}
