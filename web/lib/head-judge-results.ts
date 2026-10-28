// Shared (client + server) shapes for a pool's results: what each judge noted
// and scored for each team.

import { NOTE_CATEGORIES, notePoints, notesFromStart, type NoteCategory, type OtherCurve, type SubmittedScore } from './judging';
import { averageJudgeCurves, type JudgeCurve } from './judging-curves';
import { estimateFromNotes } from './judging-estimate';
import { scoreLimitOf, type CategorySettings } from './judging-settings';
import { limitScores, type CurveScore } from './score-curve';

// One judge's notes (counts per note type) and submitted score for one routine.
// `used` is, when the category limits its positive notes, how many of each
// positive note type counted toward the baseline (only positive types are in
// it; null = no limit).
// `points` is what a Difficulty judge's counted notes add up to (numberline
// score x multiplier of each); 0 for the other categories.
// `moves` is a Difficulty judge's notes in the order taken: where each was placed
// on the numberline (0 to 1), its rating, and whether it counted.
// `unrestricted` is the baseline the submitted score would have had with every
// note counted (null = no score, or no limit).
export type JudgeResult = {
  counts: Record<string, number>;
  used: Record<string, number> | null;
  points: number;
  moves: { position: number; rating: string; counted: boolean }[];
  submitted: SubmittedScore | null;
  unrestricted: number | null;
};

export type ResultNote = {
  noteType: string;
  notedAt: number;
  linePosition?: number | null;
  lineValue?: number | null;
  multiplier?: number | null;
};

// One judge's result from their notes (any order) and score, with the
// category's settings (the ones the score was made with, if it was).
export function judgeResultFromNotes(
  notes: readonly ResultNote[],
  routine: { startedAt: number; routineSeconds: number },
  settings: CategorySettings | undefined,
  category: NoteCategory,
  submitted: SubmittedScore | null
): JudgeResult {
  const weights = settings?.noteWeights ?? {};
  const secondsPerScore = scoreLimitOf(settings);
  const ordered = notesFromStart(notes, routine.startedAt).sort((a, b) => a.notedAt - b.notedAt);
  const scores = limitScores(
    ordered.map((n): CurveScore => ({ t: (n.notedAt - routine.startedAt) / 1000, s: notePoints(n, weights) })),
    routine.routineSeconds,
    secondsPerScore
  );
  const counts: Record<string, number> = {};
  const used: Record<string, number> = {};
  let points = 0;
  const moves: JudgeResult['moves'] = [];
  ordered.forEach((n, i) => {
    const counted = !scores[i].unused;
    counts[n.noteType] = (counts[n.noteType] ?? 0) + 1;
    if (scores[i].s > 0) used[n.noteType] = (used[n.noteType] ?? 0) + (counted ? 1 : 0);
    if (n.lineValue != null && n.multiplier != null && counted) points += notePoints(n, {});
    if (n.linePosition != null) moves.push({ position: n.linePosition, rating: n.noteType, counted });
  });
  const limited = secondsPerScore > 0;
  const unrestricted =
    submitted && limited && settings
      ? estimateFromNotes(
          ordered,
          routine.startedAt,
          routine.routineSeconds,
          weights,
          settings.estimate,
          category,
          secondsPerScore
        ).unrestricted
      : null;
  return { counts, used: limited ? used : null, points, moves, submitted, unrestricted };
}

// A team's results, combined over all its routines in the pool that weren't cancelled
// (see combineTeamRoutines): its judges by player id (a judge who noted nothing and
// hasn't scored has no entry) and, for the graph, each category's judges averaged
// into one curve. `routineId` is the newest of those routines.
export type TeamResult = { routineId: string; judges: Record<string, JudgeResult>; curves: OtherCurve[] };

// By team id. A team that hasn't played has no entry.
export type PoolResultsData = Record<string, TeamResult>;

// One run of a team's routine, as combineTeamRoutines takes it: each judge's
// result by player id and each judge's own curve (see judging-curves.ts).
export type TeamRoutineResult = { routineId: string; judges: Record<string, JudgeResult>; judgeCurves: JudgeCurve[] };

// One team's results from several runs of its routine, oldest first, as one result, so
// judges can score a team one at a time (each in their own run) and every score counts:
// - each judge's entry is from the newest run where they submitted a score, or if they
//   never did, the newest run where they took notes (a re-judge replaces their own
//   earlier score; notes in a new run without a score keep the earlier score showing);
// - each category's curve averages its judges' curves from that same run, so
//   re-judging one judge changes only their part of the average.
export function combineTeamRoutines(routines: TeamRoutineResult[]): TeamResult | null {
  const newest = routines[routines.length - 1];
  if (!newest) return null;

  // player id -> the run their entry is from
  const scored = new Map<string, TeamRoutineResult>();
  const noted = new Map<string, TeamRoutineResult>();
  for (const routine of routines) {
    for (const [playerId, result] of Object.entries(routine.judges)) {
      (result.submitted ? scored : noted).set(playerId, routine);
    }
  }
  const judges: Record<string, JudgeResult> = {};
  const curves: JudgeCurve[] = [];
  for (const playerId of new Set([...noted.keys(), ...scored.keys()])) {
    const routine = scored.get(playerId) ?? noted.get(playerId)!;
    judges[playerId] = routine.judges[playerId];
    curves.push(...routine.judgeCurves.filter((c) => c.playerId === playerId));
  }
  return { routineId: newest.routineId, judges, curves: averageJudgeCurves(curves, NOTE_CATEGORIES) };
}
