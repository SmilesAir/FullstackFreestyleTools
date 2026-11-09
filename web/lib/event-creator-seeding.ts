// Pure seeding logic, ported from the old Event Creator's seedRoundFromRankings
// (source/index.js). No DB access so it can be tested on its own.

export type Seeding = {
  // Teams that sit this round out (top seeds), strongest last.
  byes: string[];
  // pools[i] = team ids placed in pool i (A, B, ...), as the old app ordered them.
  pools: string[][];
};

// `teamsAscending` are team ids sorted by ranking points, weakest first.
// roundNumber: 1 Finals, 2 Semifinals, 3 Quarterfinals, 4 Preliminaries.
export function seedRound(teamsAscending: string[], roundNumber: number, poolCount: number): Seeding {
  if (roundNumber === 1) {
    if (poolCount !== 1) throw new Error(`Finals must have exactly 1 pool (has ${poolCount}).`);
    return { byes: [], pools: [teamsAscending.slice()] };
  }
  if (poolCount < 1) throw new Error('Need at least 1 pool to seed this round.');

  let teams = teamsAscending.slice();
  let byes: string[] = [];
  // Top 8 seeds get byes in Quarters, top 16 in Prelims.
  if (roundNumber === 3 && teams.length > 16) {
    byes = teams.slice(teams.length - 8);
    teams = teams.slice(0, teams.length - 8);
  } else if (roundNumber === 4 && teams.length > 24) {
    byes = teams.slice(teams.length - 16);
    teams = teams.slice(0, teams.length - 16);
  }

  return { byes, pools: snakePools(teams, poolCount) };
}

// Snake draft from the strongest team (last in `teamsAscending`) down,
// alternating direction each pass; each pick goes to the front of its pool (as
// the old app did), so every pool plays weakest first.
export function snakePools(teamsAscending: string[], poolCount: number): string[][] {
  const pools: string[][] = Array.from({ length: poolCount }, () => []);
  let teamIndex = teamsAscending.length - 1;
  let dir = 1;
  while (teamIndex >= 0) {
    for (let i = 0; i < poolCount && teamIndex >= 0; ++i) {
      const poolIndex = dir > 0 ? i : poolCount - 1 - i;
      pools[poolIndex].unshift(teamsAscending[teamIndex]);
      --teamIndex;
    }
    dir *= -1;
  }
  return pools;
}

// A team's result in the round before: its place in its pool, its pool total
// (null when the place came without one, e.g. imported results) and its
// ranking points (the last tie-break).
export type RoundResult = { id: string; place: number; total: number | null; points: number };

export type Advancement = {
  // Everyone in the new round, weakest first (ready for snakePools).
  entrants: string[];
  // How many of `byes` took a spot.
  byes: number;
  // Teams from the round before that didn't make it.
  cut: number;
};

// Who goes into a round of `capacity` teams: byes first (teams that sat the
// round before out, strongest by ranking points first), then the round
// before's teams by place across every pool (every 1st, then every 2nd, ...),
// equal places split by total and then by ranking points.
export function pickAdvancers({
  byes,
  results,
  capacity,
}: {
  byes: { id: string; points: number }[];
  results: RoundResult[];
  capacity: number;
}): Advancement {
  const seededByes = [...byes].sort((a, b) => b.points - a.points).slice(0, capacity);
  const advancing = [...results]
    .sort((a, b) => a.place - b.place || (b.total ?? -Infinity) - (a.total ?? -Infinity) || b.points - a.points)
    .slice(0, Math.max(0, capacity - seededByes.length));
  // Strongest first, then reversed so the weakest is first.
  const entrants = [...seededByes, ...advancing].map((t) => t.id).reverse();
  return { entrants, byes: seededByes.length, cut: results.length - advancing.length };
}
