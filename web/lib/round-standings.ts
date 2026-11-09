import 'server-only';
import { JUDGE_CATEGORIES, POOL_LETTERS, poolId, type RulesId } from './event-creator';
import { getPoolJudges, type TeamRow } from './event-creator-queries';
import { sortPoolTeams } from './event-creator-layout';
import { getPoolResults } from './head-judge-queries';
import type { HeadJudgeJudge } from './head-judge';
import { NOTE_CATEGORIES } from './judging';
import { poolStandings } from './pool-standings';
import { getSimpleRankingResults } from './simple-ranking-queries';

export type PlacedTeam = { team: TeamRow; place: number; total: number | null };
export type RoundPlaces = {
  // Every team of a finished pool, with its place.
  placed: PlacedTeam[];
  // Letters of the round's pools that aren't finished yet.
  unfinished: string[];
};

// Every pool's places for one round, worked out the way the Head Judge's
// results show them: from the judges' scores (all of them in), from the Simple
// Ranking ballots (at least one), or from places stored on the teams
// (imported results). Uses the real judges, so it ignores publishing.
export async function getRoundPlaces(
  eventId: string,
  divisionId: string,
  divisionName: string,
  rulesId: RulesId,
  roundNumber: number,
  allTeams: TeamRow[]
): Promise<RoundPlaces> {
  const usesJudges = (JUDGE_CATEGORIES[rulesId] ?? []).length > 0;
  const judges = usesJudges ? (await getPoolJudges(divisionId)).filter((j) => j.round_number === roundNumber) : [];
  const placed: PlacedTeam[] = [];
  const unfinished: string[] = [];

  for (const letter of POOL_LETTERS) {
    const pid = poolId(letter);
    const teams = sortPoolTeams(allTeams.filter((t) => t.round_number === roundNumber && t.pool_id === pid));
    if (teams.length === 0) continue;

    // Places already on every team (imported or bridged results).
    if (teams.every((t) => t.place !== null)) {
      placed.push(...teams.map((team) => ({ team, place: team.place!, total: null })));
      continue;
    }

    if (!usesJudges) {
      const ranking = await getSimpleRankingResults(divisionId, divisionName, roundNumber, letter);
      if (ranking.judgeCount === 0) {
        unfinished.push(letter);
        continue;
      }
      const byId = new Map(teams.map((t) => [t.id, t]));
      // Fewest rank points wins, so a lower rank sum is a better total.
      for (const row of ranking.rows) placed.push({ team: byId.get(row.teamId)!, place: row.place, total: -row.total });
      continue;
    }

    const judgesByCategory = NOTE_CATEGORIES.map((category) => ({
      judges: judges
        .filter((j) => j.pool_id === pid && j.category_type === category)
        .map((j): HeadJudgeJudge => ({ playerId: j.player_id, name: j.name, categoryType: j.category_type })),
    })).filter((c) => c.judges.length > 0);
    if (judgesByCategory.length === 0) {
      unfinished.push(letter);
      continue;
    }
    const data = await getPoolResults(eventId, divisionId, roundNumber, letter);
    const standings = poolStandings(
      teams.map((t) => ({ id: t.id, players: t.players.map((p) => p.name), place: t.place })),
      data,
      judgesByCategory
    );
    // Finished once every judge has scored every team.
    const finished = standings.every((r) => r.place !== null && r.categories.every((c) => c.scores.every((s) => s !== null)));
    if (!finished) {
      unfinished.push(letter);
      continue;
    }
    standings.forEach((r, i) => placed.push({ team: teams[i], place: r.place!, total: r.total }));
  }
  return { placed, unfinished };
}
