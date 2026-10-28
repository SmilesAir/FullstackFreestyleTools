import type { HeadJudgeJudge, HeadJudgeTeam } from './head-judge';
import type { PoolResultsData } from './head-judge-results';

const round2 = (v: number) => Math.round(v * 100) / 100;

export type StandingRow = {
  team: HeadJudgeTeam;
  playIndex: number;
  // Per category (in the order given): each judge's submitted score, and their sum.
  categories: { scores: (number | null)[]; total: number | null }[];
  // The pool's Adjustment (see poolAdjustment), the same for every team; null with no total.
  adjustment: number | null;
  // Every submitted score added up, plus the Adjustment; null before any are in.
  total: number | null;
  // Place in the pool by total, always 1, 2, 3...; null with no total. Equal
  // totals are split by categories won, then by seed (the later team wins).
  place: number | null;
  // What decided this place against a team on the same total; null with no tie.
  tieBreak: 'categories' | 'seed' | null;
};

// How many categories this row beats each other row on the same total in,
// added up (a missing category total loses to any number).
function categoryWins(row: { categories: { total: number | null }[] }, tied: { categories: { total: number | null }[] }[]): number {
  let wins = 0;
  for (const other of tied) {
    if (other === row) continue;
    row.categories.forEach((c, i) => {
      const theirs = other.categories[i].total;
      if (c.total !== null && (theirs === null || c.total > theirs)) wins++;
    });
  }
  return wins;
}

// The whole number added to every team's total so that all of them are above
// zero: nothing when the lowest total isn't negative, otherwise just enough to
// lift it over 0 (a lowest of -5.8 adds 6). Worked out from the scores each
// time, never stored; it adds the same to every team, so places don't change.
export function poolAdjustment(rawTotals: (number | null)[]): number {
  const lowest = Math.min(0, ...rawTotals.filter((t): t is number => t !== null));
  return lowest < 0 ? Math.floor(-lowest) + 1 : 0;
}

// A pool's standings, one row per team in play order: the same numbers the
// Head Judge's results summary shows and the Discord results image draws.
export function poolStandings(
  teams: HeadJudgeTeam[],
  data: PoolResultsData,
  judgesByCategory: { judges: HeadJudgeJudge[] }[]
): StandingRow[] {
  const raw = teams.map((team, playIndex) => {
    const result = data[team.id];
    const categories = judgesByCategory.map(({ judges }) => {
      const scores = judges.map((j) => result?.judges[j.playerId]?.submitted?.score ?? null);
      const submitted = scores.filter((s): s is number => s !== null);
      return { scores, total: submitted.length > 0 ? round2(submitted.reduce((a, b) => a + b, 0)) : null };
    });
    const totals = categories.map((c) => c.total).filter((t): t is number => t !== null);
    return { team, playIndex, categories, total: totals.length > 0 ? round2(totals.reduce((a, b) => a + b, 0)) : null };
  });
  const adjustment = poolAdjustment(raw.map((r) => r.total));
  const rows = raw.map((row) => ({
    ...row,
    adjustment: row.total === null ? null : adjustment,
    total: row.total === null ? null : round2(row.total + adjustment),
  }));
  const wins = rows.map((row) => categoryWins(row, rows.filter((r) => r.total !== null && r.total === row.total)));
  // Highest total first; on equal totals more categories won, then the later play index.
  const ranked = rows
    .map((row, i) => ({ row, i, wins: wins[i] }))
    .filter(({ row }) => row.total !== null)
    .sort((a, b) => b.row.total! - a.row.total! || b.wins - a.wins || b.row.playIndex - a.row.playIndex);
  const place = new Map<number, { place: number; tieBreak: StandingRow['tieBreak'] }>();
  ranked.forEach((r, k) => {
    const neighbours = [ranked[k - 1], ranked[k + 1]].filter((n) => n && n.row.total === r.row.total);
    const tieBreak = neighbours.length === 0 ? null : neighbours.some((n) => n.wins === r.wins) ? 'seed' : 'categories';
    place.set(r.i, { place: k + 1, tieBreak });
  });
  return rows.map((row, i) => ({ ...row, ...(place.get(i) ?? { place: null, tieBreak: null }) }));
}

// Best first; a team with no total yet goes last (keeping play order among those).
export const byPlace = (a: StandingRow, b: StandingRow) => (a.place ?? Infinity) - (b.place ?? Infinity);
