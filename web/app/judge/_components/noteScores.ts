import { noteFullLabel, notePoints, type JudgeNote, type NoteCategory } from '@/lib/judging';
import type { CurveScore } from '@/lib/score-curve';
import { NOTE_COLOR, NOTE_DOT_SCALE } from './noteStyles';

// The judge's notes as points for the graph: seconds into the routine, and what
// each note is worth (the event's weight, or for Difficulty the numberline score
// times the rating's multiplier).
export function noteScores(
  notes: readonly JudgeNote[],
  noteWeights: Record<string, number>,
  routineStartedAt: number,
  category: NoteCategory
): CurveScore[] {
  return notes.map((n) => ({
    id: n.id,
    label: noteFullLabel(category, n.noteType),
    t: Math.max(0, (n.notedAt - routineStartedAt) / 1000),
    s: notePoints(n, noteWeights),
    color: NOTE_COLOR[n.noteType],
    dotScale: NOTE_DOT_SCALE[n.noteType],
  }));
}

// The time axis: whole 30-second steps, long enough to hold the routine and a late note.
export function graphDuration(routineSeconds: number, scores: readonly CurveScore[]): number {
  const latest = scores.reduce((m, s) => Math.max(m, s.t), 0);
  return Math.max(30, Math.ceil(Math.max(routineSeconds, latest) / 30) * 30);
}
