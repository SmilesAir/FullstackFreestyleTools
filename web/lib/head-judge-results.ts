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

// A team's results, combined over all its routines in the pool that weren't cancelled
// (see combineTeamRoutines): its judges by player id (a judge who noted nothing and
// hasn't scored has no entry) and, for the graph, each category's judges averaged
// into one curve. `routineId` is the newest of those routines.
export type TeamResult = { routineId: string; judges: Record<string, JudgeResult>; curves: OtherCurve[] };

// By team id. A team that hasn't played has no entry.
export type PoolResultsData = Record<string, TeamResult>;

// One team's results from several runs of its routine, oldest first, as one result, so
// judges can score a team one at a time (each in their own run) and every score counts:
// - each judge's entry is from the newest run where they submitted a score, or if they
//   never did, the newest run where they took notes (a re-judge replaces their own
//   earlier score; notes in a new run without a score keep the earlier score showing);
// - each category's averaged curve is from the newest run that has one.
export function combineTeamRoutines(routines: TeamResult[]): TeamResult | null {
  const newest = routines[routines.length - 1];
  if (!newest) return null;

  const scored: Record<string, JudgeResult> = {};
  const noted: Record<string, JudgeResult> = {};
  const curves = new Map<string, OtherCurve>();
  for (const routine of routines) {
    for (const [playerId, result] of Object.entries(routine.judges)) {
      if (result.submitted) scored[playerId] = result;
      else noted[playerId] = result;
    }
    for (const curve of routine.curves) curves.set(curve.category, curve);
  }
  return {
    routineId: newest.routineId,
    judges: { ...noted, ...scored },
    curves: [...curves.values()],
  };
}
