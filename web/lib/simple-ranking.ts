// Simple Ranking: pure rules, shared by the judge screen and the server action
// (so what a judge presses and what gets validated agree) and by the head
// judge's aggregation. No database here.

// A ballot is an ordered list of team ids, best team first. The ranks in use
// are always its list positions (1, 2, 3 … with no repeats or gaps), so two
// teams can never share a rank by construction.
export type Ranking = readonly string[];

const without = (ranking: Ranking, teamId: string) => ranking.filter((id) => id !== teamId);

// A ranked team swaps ranks with its neighbour; it never just changes number
// on its own. No-op at the ends (nobody to swap with).
export function move(ranking: Ranking, teamId: string, direction: 'up' | 'down'): Ranking {
  const idx = ranking.indexOf(teamId);
  if (idx === -1) return ranking;
  const otherIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (otherIdx < 0 || otherIdx >= ranking.length) return ranking;
  const next = [...ranking];
  [next[idx], next[otherIdx]] = [next[otherIdx], next[idx]];
  return next;
}

// An unranked team is inserted rather than swapped, so nobody ends up tied or
// bumped out: "up" takes 1st (everyone ranked moves down one); "down" takes
// 2nd (the teams from 2nd on move down one). The very first team ranked always
// lands in 1st, whichever arrow is pressed.
export function place(ranking: Ranking, teamId: string, direction: 'up' | 'down'): Ranking {
  if (ranking.includes(teamId)) return ranking;
  const rest = without(ranking, teamId);
  const index = rest.length === 0 ? 0 : direction === 'up' ? 0 : 1;
  return [...rest.slice(0, index), teamId, ...rest.slice(index)];
}

// What one arrow press on one team does to the ranking: place it if it has no
// rank yet, otherwise swap it with its neighbour. This is the one function the
// judge screen calls.
export function pressArrow(ranking: Ranking, teamId: string, direction: 'up' | 'down'): Ranking {
  return ranking.includes(teamId) ? move(ranking, teamId, direction) : place(ranking, teamId, direction);
}

// Every team of the pool has a rank: nothing left to place.
export function isComplete(ranking: Ranking, teamIds: readonly string[]): boolean {
  return ranking.length === teamIds.length && teamIds.every((id) => ranking.includes(id));
}

// A ballot counts only while it still names exactly this pool's teams (no more,
// no fewer, none twice) — a ranking made before the teams were edited doesn't.
function isValidBallot(ballot: Ranking, teamIds: readonly string[]): boolean {
  if (ballot.length !== teamIds.length) return false;
  const seen = new Set(ballot);
  return seen.size === ballot.length && teamIds.every((id) => seen.has(id));
}

export type TeamTally = {
  teamId: string;
  // counts[i] = how many judges put this team in rank i+1.
  counts: number[];
  total: number;
  place: number;
  // This place was decided by the seed tie-break (equal total to a neighbour).
  tie: boolean;
};

export type SimpleRankingResult = { rows: TeamTally[]; judgeCount: number; outdatedCount: number };

// Turns every submitted ballot for a pool into the results table: each team's
// count of every place it was given, its total (fewest wins), and its final
// place — ties broken toward the team with the later play order (the last
// entry in `teamIds`, which is already in play order).
export function aggregate(teamIds: readonly string[], ballots: readonly Ranking[]): SimpleRankingResult {
  const valid = ballots.filter((b) => isValidBallot(b, teamIds));
  const n = teamIds.length;
  const counts = new Map<string, number[]>(teamIds.map((id) => [id, new Array(n).fill(0)]));
  const totals = new Map<string, number>(teamIds.map((id) => [id, 0]));
  for (const ballot of valid) {
    ballot.forEach((teamId, idx) => {
      counts.get(teamId)![idx]++;
      totals.set(teamId, totals.get(teamId)! + idx + 1);
    });
  }

  const ordered = teamIds
    .map((teamId, playIndex) => ({ teamId, playIndex, total: totals.get(teamId)! }))
    // Fewest points wins; a tie goes to the team with the later (higher) play index.
    .sort((a, b) => a.total - b.total || b.playIndex - a.playIndex);

  const rows: TeamTally[] = ordered.map((o, i) => ({
    teamId: o.teamId,
    counts: counts.get(o.teamId)!,
    total: o.total,
    place: i + 1,
    tie: false,
  }));
  if (valid.length > 0) {
    rows.forEach((row, i) => {
      row.tie = (i > 0 && rows[i - 1].total === row.total) || (i < rows.length - 1 && rows[i + 1].total === row.total);
    });
  }

  return { rows, judgeCount: valid.length, outdatedCount: ballots.length - valid.length };
}
