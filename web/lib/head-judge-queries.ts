import 'server-only';
import { pool } from './db';
import { DIVISION_NAMES, JUDGE_CATEGORIES, POOL_LETTERS, ROSTER_ROUND, poolId, type RulesId } from './event-creator';
import { sortPoolTeams } from './event-creator-layout';
import { getPoolJudges, getTeams, listDivisions } from './event-creator-queries';
import { poolKey, roundName, type HeadJudgeDivision, type HeadJudgePool } from './head-judge';
import { NO_PLAY_STATE, type PlayResponse } from './head-judge-state';

// The event's live play state, with the database's clock read in the same query
// (every screen measures its clock against this one, so timers agree).
export async function getPlayState(eventId: string): Promise<PlayResponse> {
  const result = await pool.query<{
    division_id: string | null;
    round_number: number | null;
    pool_id: string | null;
    team_id: string | null;
    started_ms: number | null;
    updated_ms: number | null;
    now_ms: number;
  }>(
    `SELECT s.division_id, s.round_number, s.pool_id, s.team_id,
            extract(epoch FROM s.routine_started_at)::float8 * 1000 AS started_ms,
            extract(epoch FROM s.updated_at)::float8 * 1000 AS updated_ms,
            extract(epoch FROM now())::float8 * 1000 AS now_ms
     FROM (SELECT 1) one
     LEFT JOIN event_play_state s ON s.event_id = $1`,
    [eventId]
  );
  const row = result.rows[0];
  const serverNow = Math.round(row.now_ms);
  // Only a row for a pool that still exists counts as a playing pool.
  if (!row.pool_id || row.round_number === null) return { state: NO_PLAY_STATE, serverNow };
  return {
    state: {
      divisionId: row.division_id,
      roundNumber: row.round_number,
      poolLetter: row.pool_id.replace(/^pool/, ''),
      teamId: row.team_id,
      routineStartedAt: row.started_ms === null ? null : Math.round(row.started_ms),
      updatedAt: Math.round(row.updated_ms ?? 0),
    },
    serverNow,
  };
}

const divisionOrder = (name: string) => {
  const i = DIVISION_NAMES.indexOf(name as (typeof DIVISION_NAMES)[number]);
  return i === -1 ? DIVISION_NAMES.length : i;
};

// Every pool that has teams in the event, grouped by division and then round.
// Divisions come in the standard order, rounds in playing order (the earliest
// round, with the highest number, first and the Finals last), pools A to D,
// teams in play order.
export async function getHeadJudgePools(eventId: string): Promise<HeadJudgeDivision[]> {
  const divisions = (await listDivisions(eventId)).sort(
    (a, b) => divisionOrder(a.division_name) - divisionOrder(b.division_name)
  );

  return Promise.all(
    divisions.map(async (division): Promise<HeadJudgeDivision> => {
      const [teams, judges] = await Promise.all([
        getTeams(division.id, division.division_name),
        getPoolJudges(division.id),
      ]);

      const roundNumbers = [...new Set(teams.filter((t) => t.round_number !== ROSTER_ROUND).map((t) => t.round_number))];
      roundNumbers.sort((a, b) => b - a);

      const rounds = roundNumbers.map((number) => {
        const pools: HeadJudgePool[] = [];
        for (const letter of POOL_LETTERS) {
          const inPool = teams.filter((t) => t.round_number === number && t.pool_id === poolId(letter));
          if (inPool.length === 0) continue;
          pools.push({
            key: poolKey(division.id, number, letter),
            divisionId: division.id,
            divisionName: division.division_name,
            roundNumber: number,
            roundName: roundName(number),
            letter,
            teams: sortPoolTeams(inPool).map((t) => ({ id: t.id, players: t.players.map((p) => p.name) })),
            routineSeconds: division.routine_seconds,
            usesJudges: (JUDGE_CATEGORIES[division.rules_id as RulesId] ?? []).length > 0,
            judges: judges
              .filter((j) => j.round_number === number && j.pool_id === poolId(letter))
              .map((j) => ({ playerId: j.player_id, name: j.name, categoryType: j.category_type })),
          });
        }
        return { number, name: roundName(number), pools };
      });

      return { id: division.id, name: division.division_name, rounds: rounds.filter((r) => r.pools.length > 0) };
    })
  );
}
