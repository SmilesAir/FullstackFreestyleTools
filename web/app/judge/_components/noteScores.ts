import { notePoints, notesFromStart, type JudgeNote, type NoteCategory } from '@/lib/judging';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import { noteFullLabel } from '@/lib/i18n/labels';
import { limitScores, type CurveScore } from '@/lib/score-curve';
import { NOTE_COLOR, NOTE_DOT_SCALE } from './noteStyles';

// The judge's notes as points for the graph: seconds into the routine, and what
// each note is worth (the event's weight, or for Difficulty the numberline score
// times the rating's multiplier). Positive notes past the routine's limit are
// marked unused (see limitScores): drawn gray and left out of the baseline.
export function noteScores(
  notes: readonly JudgeNote[],
  noteWeights: Record<string, number>,
  routineStartedAt: number,
  category: NoteCategory,
  routineSeconds: number,
  secondsPerScore: number,
  // For each note's name on the graph.
  t: Dictionary
): CurveScore[] {
  const scores = notesFromStart(notes, routineStartedAt).map((n) => ({
    id: n.id,
    label: noteFullLabel(t, n.noteType),
    t: (n.notedAt - routineStartedAt) / 1000,
    s: notePoints(n, noteWeights),
    color: NOTE_COLOR[n.noteType],
    dotScale: NOTE_DOT_SCALE[n.noteType],
  }));
  return limitScores(scores, routineSeconds, secondsPerScore);
}

// The time axis: whole 30-second steps, long enough to hold the routine and a late note.
export function graphDuration(routineSeconds: number, scores: readonly CurveScore[]): number {
  const latest = scores.reduce((m, s) => Math.max(m, s.t), 0);
  return Math.max(30, Math.ceil(Math.max(routineSeconds, latest) / 30) * 30);
}
