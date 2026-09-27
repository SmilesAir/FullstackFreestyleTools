import type { HeadJudgeJudge, HeadJudgeTeam } from './head-judge';
import type { PoolResultsData } from './head-judge-results';

const round2 = (v: number) => Math.round(v * 100) / 100;

export type StandingRow = {
  team: HeadJudgeTeam;
  playIndex: number;
  // Per category (in the order given): each judge's submitted score, and their sum.
  categories: { scores: (number | null)[]; total: number | null }[];
  // Every submitted score added up; null before any are in.
  total: number | null;
  // Place in the pool by total (equal totals share a place); null with no total.
  place: number | null;
};

// A pool's standings, one row per team in play order: the same numbers the
// Head Judge's results summary shows and the Discord results image draws.
export function poolStandings(
  teams: HeadJudgeTeam[],
  data: PoolResultsData,
  judgesByCategory: { judges: HeadJudgeJudge[] }[]
): StandingRow[] {
  const rows = teams.map((team, playIndex) => {
    const result = data[team.id];
    const categories = judgesByCategory.map(({ judges }) => {
      const scores = judges.map((j) => result?.judges[j.playerId]?.submitted?.score ?? null);
      const submitted = scores.filter((s): s is number => s !== null);
      return { scores, total: submitted.length > 0 ? round2(submitted.reduce((a, b) => a + b, 0)) : null };
    });
    const totals = categories.map((c) => c.total).filter((t): t is number => t !== null);
    return { team, playIndex, categories, total: totals.length > 0 ? round2(totals.reduce((a, b) => a + b, 0)) : null };
  });
  return rows.map((row) => ({
    ...row,
    place: row.total === null ? null : 1 + rows.filter((r) => r.total !== null && r.total > row.total!).length,
  }));
}

// Best first; a team with no total yet goes last (keeping play order among those).
export const byPlace = (a: StandingRow, b: StandingRow) => (a.place ?? Infinity) - (b.place ?? Infinity);
