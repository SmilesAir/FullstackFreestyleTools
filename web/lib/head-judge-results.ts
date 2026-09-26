// Shared (client + server) shapes for a pool's results: what each judge noted
// and scored for each team.

import type { OtherCurve, SubmittedScore } from './judging';

// One judge's notes (counts per note type) and submitted score for one routine.
// `points` is what a Difficulty judge's notes add up to (numberline score x
// multiplier of each); 0 for the other categories.
// `moves` is a Difficulty judge's notes in the order taken: where each was placed
// on the numberline (0 to 1) and its rating.
export type JudgeResult = {
  counts: Record<string, number>;
  points: number;
  moves: { position: number; rating: string }[];
  submitted: SubmittedScore | null;
};

// The team's most recent routine that wasn't cancelled, with its judges by
// player id (a judge who noted nothing and hasn't scored has no entry) and, for
// the graph, each category's judges averaged into one curve.
export type TeamResult = { routineId: string; judges: Record<string, JudgeResult>; curves: OtherCurve[] };

// By team id. A team that hasn't played has no entry.
export type PoolResultsData = Record<string, TeamResult>;
