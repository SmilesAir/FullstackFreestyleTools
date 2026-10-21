import 'server-only';
// What the Head Judge's support chat reads to explain a pool's results: the
// event's pools to pick from, and one pool's standings with every judge's
// score, notes and what made the score (counted and dropped notes, the
// percentage change, and for Difficulty each move's place on the numberline,
// rating and time). Plain JSON with short rounded numbers, so it stays small.

import { getHeadJudgePools, getPoolRoutines, type PoolRoutine, type PoolRoutineJudge } from './head-judge-queries';
import { flattenPools, teamName, type HeadJudgePool } from './head-judge';
import { combineTeamRoutines, type PoolResultsData } from './head-judge-results';
import { NOTE_CATEGORIES, categoryByType, noteFullLabel, notePoints, type NoteCategory } from './judging';
import { scoreLimitOf, type CategorySettings } from './judging-settings';
import { poolStandings } from './pool-standings';
import { scoreLimit } from './score-curve';

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const clock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// A numberline position (0 to 1) as the Results tab shows it: 0 to 10.
const shown = (position: number) => r1(position * 10);

const poolLabel = (p: HeadJudgePool) => `${p.divisionName} ${p.roundName} pool ${p.letter}`;

// The event's pools, for the chat to find the one being asked about. With a
// query, only pools where every word of it starts a word of the division,
// round, pool letter or team names ("finals" isn't "Semifinals"; all pools
// when none match).
export async function listPoolsForChat(eventId: string, query?: string) {
  const pools = flattenPools(await getHeadJudgePools(eventId)).map((p) => ({
    division_id: p.divisionId,
    round_number: p.roundNumber,
    pool: p.letter,
    name: poolLabel(p),
    scored_by_judges: p.usesJudges,
    results_published: p.resultsPublished,
    teams: p.teams.map(teamName),
  }));
  const words = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return pools;
  const matching = pools.filter((p) => {
    const text = `${p.name} pool${p.pool} ${p.teams.join(' ')}`.toLowerCase().split(/[\s/]+/);
    return words.every((w) => text.some((t) => t.startsWith(w)));
  });
  return matching.length > 0 ? matching : pools;
}

// Each judge's run to explain, by the same rule the results use (see
// combineTeamRoutines): their newest run with a submitted score, otherwise
// their newest run with notes. `routines` are one team's, oldest first.
function judgeRuns(routines: PoolRoutine[]): Record<string, { routine: PoolRoutine; judge: PoolRoutineJudge }> {
  const scored: Record<string, { routine: PoolRoutine; judge: PoolRoutineJudge }> = {};
  const noted: Record<string, { routine: PoolRoutine; judge: PoolRoutineJudge }> = {};
  for (const routine of routines) {
    for (const [playerId, judge] of Object.entries(routine.judges)) {
      if (judge.result.submitted) scored[playerId] = { routine, judge };
      else noted[playerId] = { routine, judge };
    }
  }
  return { ...noted, ...scored };
}

// How one category is scored with these settings, in words, so the chat never
// has to guess the maths.
function scoringNote(category: NoteCategory, settings: CategorySettings | undefined): string {
  const weights = settings?.noteWeights ?? {};
  const secondsPerScore = scoreLimitOf(settings);
  const limit =
    secondsPerScore > 0
      ? ` Only one positive note per ${secondsPerScore} s of routine counts (the most valuable ones, wherever they are); the rest are dropped. Negative notes always count.`
      : ' Every note counts (no limit).';
  const adjust = ' The judge then changes the baseline by a percentage of its size to give the submitted score.';
  if (category === 'Diff') {
    const line = settings?.line;
    const named = line?.moves.map((m) => `${m.name} ${shown(m.position)}`).join(', ') ?? 'none';
    const power = settings?.estimate.power ?? 1;
    const timing =
      power === 1
        ? 'Power is 1, so when a move happens makes no difference: the baseline is the counted moves\' points added up, times the area scale.'
        : `Power is ${power}, above 1, so moves close together (within a few seconds) stack into a tall hill and are worth more than the same moves spread out.`;
    return (
      `Each move is tapped on a numberline, shown from 0 to 10 as on the Results tab (the top is worth ${line?.max ?? '?'} points; named moves as guides: ${named}), and rated. ` +
      `Points = position / 10 x ${line?.max ?? '?'} x the rating's multiplier (${Object.entries(weights).map(([k, v]) => `${k} x${v}`).join(', ')}). ` +
      `Baseline = area under the curve of the counted moves x area scale ${settings?.estimate.areaScale ?? 1}. ${timing}${limit}${adjust}`
    );
  }
  const worth = Object.entries(weights)
    .map(([k, v]) => `${noteFullLabel(category, k)} ${v > 0 ? '+' : ''}${v}`)
    .join(', ');
  return `Baseline = the counted notes' worth added up (${worth}). Timing makes no difference.${category === 'AI' ? ' Every note counts (no limit).' : limit}${adjust}`;
}

// The named move a numberline position is closest to ("near Gitis").
function nearestMove(position: number, settings: CategorySettings | undefined): string | null {
  const moves = settings?.line?.moves ?? [];
  if (moves.length === 0) return null;
  const best = moves.reduce((a, b) => (Math.abs(b.position - position) < Math.abs(a.position - position) ? b : a));
  return best.name;
}

// One judge's notes, score and the shape of their notes over the routine.
function judgeDetail(name: string, routine: PoolRoutine, judge: PoolRoutineJudge) {
  const { category, settings, result } = judge;
  const weights = settings?.noteWeights ?? {};
  const seconds = routine.routineSeconds;
  const timed = judge.notes.map((n) => ({ n, t: Math.max(0, (n.notedAt - routine.startedAt) / 1000), s: notePoints(n, weights) }));
  // judgeResultFromNotes keeps the notes' order, so its moves line up with the Diff notes.
  const countedFlags = timed.map(() => true);
  if (category === 'Diff') {
    let m = 0;
    timed.forEach((x, i) => {
      if (x.n.linePosition != null) countedFlags[i] = result.moves[m++]?.counted ?? true;
    });
  }

  const positiveTaken = timed.filter((x) => x.s > 0).length;
  const positiveUsed = result.used ? Object.values(result.used).reduce((a, b) => a + b, 0) : positiveTaken;
  const secondsPerScore = scoreLimitOf(settings);
  const thirds = [0, 1, 2].map((i) => {
    const inThird = timed.filter((x) => Math.min(2, Math.floor((x.t / seconds) * 3)) === i);
    return { notes: inThird.length, points: r1(inThird.reduce((a, x) => a + x.s, 0)) };
  });

  const detail: Record<string, unknown> = {
    judge: name,
    category: categoryByType(category)?.label ?? category,
    score: result.submitted?.score ?? null,
    baseline: result.submitted?.baseline ?? null,
    adjust_percent: result.submitted?.adjustPercent ?? null,
    baseline_if_every_note_counted: result.unrestricted,
    notes: Object.fromEntries(Object.entries(result.counts).map(([type, count]) => [noteFullLabel(category, type), count])),
    note_points_total: r1(timed.reduce((a, x) => a + x.s, 0)),
    limit:
      secondsPerScore > 0
        ? { positive_notes_allowed: scoreLimit(seconds, secondsPerScore), positive_taken: positiveTaken, positive_counted: positiveUsed }
        : null,
    note_points_by_third_before_limit: { opening: thirds[0], middle: thirds[1], closing: thirds[2] },
    run_started_at: new Date(routine.startedAt).toISOString(),
  };
  if (!result.submitted) detail.status = 'no score submitted yet';

  if (category === 'Diff') {
    const moves = timed
      .map((x, i) => ({ ...x, counted: countedFlags[i] }))
      .filter((x) => x.n.linePosition != null);
    const positions = moves.map((x) => x.n.linePosition!);
    const ratings: Record<string, number> = {};
    const pointsByRating: Record<string, number> = {};
    for (const x of moves) {
      ratings[x.n.noteType] = (ratings[x.n.noteType] ?? 0) + 1;
      pointsByRating[x.n.noteType] = r2((pointsByRating[x.n.noteType] ?? 0) + (x.counted ? x.s : 0));
    }
    const nearest: Record<string, number> = {};
    for (const p of positions) {
      const name = nearestMove(p, settings);
      if (name) nearest[name] = (nearest[name] ?? 0) + 1;
    }
    let longestGap = 0;
    const times = [0, ...moves.map((x) => x.t), seconds].sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) longestGap = Math.max(longestGap, times[i] - times[i - 1]);
    // The most counted points within any 10 seconds (what a power above 1 rewards).
    let cluster = { points: 0, moves: 0, at: 0 };
    for (const a of moves) {
      const inWindow = moves.filter((b) => b.counted && b.t >= a.t && b.t < a.t + 10);
      const points = inWindow.reduce((sum, b) => sum + b.s, 0);
      if (points > cluster.points) cluster = { points, moves: inWindow.length, at: a.t };
    }
    const sorted = [...positions].sort((a, b) => a - b);
    detail.difficulty = {
      moves: moves.length,
      ratings,
      counted_points_by_rating: pointsByRating,
      position_mean: positions.length ? shown(positions.reduce((a, b) => a + b, 0) / positions.length) : null,
      position_median: sorted.length ? shown(sorted[Math.floor(sorted.length / 2)]) : null,
      position_max: positions.length ? shown(Math.max(...positions)) : null,
      moves_nearest_named_move: nearest,
      moves_per_minute: r1(moves.length / (seconds / 60)),
      longest_gap_seconds: r1(longestGap),
      biggest_10s_cluster: cluster.moves > 0 ? { points: r2(cluster.points), moves: cluster.moves, from: clock(cluster.at) } : null,
      // Every move: time, numberline position (0 to 10), rating, points, and "dropped" if over the limit.
      move_list: moves.map(
        (x) => `${clock(x.t)} ${shown(x.n.linePosition!)} ${x.n.noteType} ${r2(x.s)}${x.counted ? '' : ' dropped'}`
      ),
    };
  }
  return detail;
}

// One pool's results explained: how each category is scored, the standings,
// and for each team every judge's score and notes. Null when the pool isn't
// one of this event's.
export async function explainPool(eventId: string, divisionId: string, roundNumber: number, letter: string) {
  const pool = flattenPools(await getHeadJudgePools(eventId)).find(
    (p) => p.divisionId === divisionId && p.roundNumber === roundNumber && p.letter === letter
  );
  if (!pool) return null;
  if (!pool.usesJudges) return { pool: poolLabel(pool), error: 'This pool is placed by Simple Ranking ballots, not judges\' notes, so there are no scores to explain.' };

  const routines = await getPoolRoutines(eventId, divisionId, roundNumber, letter);
  const byTeam = new Map<string, PoolRoutine[]>();
  for (const r of routines) byTeam.set(r.teamId, [...(byTeam.get(r.teamId) ?? []), r]);

  // The same standings the Results tab shows.
  const data: PoolResultsData = {};
  for (const [teamId, teamRoutines] of byTeam) {
    const combined = combineTeamRoutines(
      teamRoutines.map((r) => ({
        routineId: r.id,
        judges: Object.fromEntries(Object.entries(r.judges).map(([id, j]) => [id, j.result])),
        curves: r.curves,
      }))
    );
    if (combined) data[teamId] = combined;
  }
  const judgesByCategory = NOTE_CATEGORIES.map((category) => ({
    category,
    judges: pool.judges.filter((j) => j.categoryType === category).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((c) => c.judges.length > 0);
  const standings = poolStandings(pool.teams, data, judgesByCategory);

  // How each category is scored, from the first judge's settings found for it.
  const scoring: Record<string, string> = {};
  for (const r of routines) {
    for (const judge of Object.values(r.judges)) {
      const label = categoryByType(judge.category)?.label ?? judge.category;
      scoring[label] ??= scoringNote(judge.category, judge.settings);
    }
  }

  const names = new Map(pool.judges.map((j) => [j.playerId, j.name]));
  const teams = [...standings]
    .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || a.playIndex - b.playIndex)
    .map((row) => {
      const runs = judgeRuns(byTeam.get(row.team.id) ?? []);
      const judges = judgesByCategory.flatMap(({ judges: list }) =>
        list.filter((j) => runs[j.playerId]).map((j) => judgeDetail(j.name, runs[j.playerId].routine, runs[j.playerId].judge))
      );
      // Notes from someone not listed as a judge of this pool don't count toward the total.
      const unlisted = Object.entries(runs)
        .filter(([id]) => !names.has(id))
        .map(([, { routine, judge }]) => ({ ...judgeDetail('(not a judge of this pool)', routine, judge), counts_toward_total: false }));
      return {
        team: teamName(row.team),
        place: row.place,
        total: row.total,
        category_totals: Object.fromEntries(
          judgesByCategory.map((c, i) => [categoryByType(c.category)?.label ?? c.category, row.categories[i].total])
        ),
        play_order: row.playIndex + 1,
        played: byTeam.has(row.team.id),
        times_played: byTeam.get(row.team.id)?.length ?? 0,
        judges: [...judges, ...unlisted],
      };
    });

  return {
    pool: poolLabel(pool),
    routine_length: clock(pool.routineSeconds),
    results_published: pool.resultsPublished,
    how_scores_are_made: {
      ...scoring,
      total: "A team's total is every listed judge's submitted score added up; place is by total, highest first, equal totals share a place.",
    },
    judges: judgesByCategory.map((c) => ({
      category: categoryByType(c.category)?.label ?? c.category,
      judges: c.judges.map((j) => j.name),
    })),
    teams,
  };
}
