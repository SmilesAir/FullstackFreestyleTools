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

  // Snake draft from the strongest remaining team down, alternating direction
  // each pass; each pick goes to the front of its pool (as the old app did).
  const pools: string[][] = Array.from({ length: poolCount }, () => []);
  let teamIndex = teams.length - 1;
  let dir = 1;
  while (teamIndex >= 0) {
    for (let i = 0; i < poolCount && teamIndex >= 0; ++i) {
      const poolIndex = dir > 0 ? i : poolCount - 1 - i;
      pools[poolIndex].unshift(teams[teamIndex]);
      --teamIndex;
    }
    dir *= -1;
  }

  return { byes, pools };
}
