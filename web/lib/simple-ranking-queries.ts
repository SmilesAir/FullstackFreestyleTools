import 'server-only';
import { pool } from './db';
import { poolId } from './event-creator';
import { sortPoolTeams } from './event-creator-layout';
import { getTeams } from './event-creator-queries';
import { roundName } from './head-judge';
import { aggregate, type Ranking, type SimpleRankingResult } from './simple-ranking';

const poolTitleOf = (divisionName: string, roundNumber: number, letter: string) =>
  `${divisionName} · ${roundName(roundNumber)} · Pool ${letter}`;

export type SimpleRankingPool = {
  divisionId: string;
  roundNumber: number;
  poolLetter: string;
  poolTitle: string;
  // In play order (best team to judge later comes last), for the judge screen's rows.
  teams: { id: string; name: string }[];
};

// Public: no permission check (judges don't sign in). The event's playing pool,
// only if its division is on Simple Ranking rules; otherwise null (the judge
// screen says there's nothing to rank).
export async function getPlayingSimpleRankingPool(eventId: string): Promise<SimpleRankingPool | null> {
  const play = await pool.query<{
    division_id: string;
    division_name: string;
    round_number: number;
    pool_id: string;
    routine_seconds: number;
  }>(
    `SELECT d.id AS division_id, d.division_name, s.round_number, s.pool_id, d.routine_seconds
     FROM events e
     JOIN event_play_state s ON s.event_id = e.id
     JOIN divisions d ON d.id = s.division_id AND d.rules_id = 'SimpleRanking'
     WHERE e.id = $1 AND e.is_playing AND s.round_number IS NOT NULL`,
    [eventId]
  );
  const row = play.rows[0];
  if (!row) return null;

  const letter = row.pool_id.replace(/^pool/i, '').toUpperCase();
  const teams = await getTeams(row.division_id, row.division_name);
  const inPool = sortPoolTeams(teams.filter((t) => t.round_number === row.round_number && t.pool_id === row.pool_id));
  if (inPool.length === 0) return null;

  return {
    divisionId: row.division_id,
    roundNumber: row.round_number,
    poolLetter: letter,
    poolTitle: poolTitleOf(row.division_name, row.round_number, letter),
    teams: inPool.map((t) => ({ id: t.id, name: t.players.map((p) => p.name).join(' / ') || '(no players)' })),
  };
}

// This judge's own saved ranking for the pool (null if they haven't sent one).
export async function getOwnBallot(
  divisionId: string,
  roundNumber: number,
  poolLetter: string,
  judgeToken: string
): Promise<Ranking | null> {
  const result = await pool.query<{ ranking: string[] }>(
    `SELECT ranking FROM simple_ranking_ballots
     WHERE division_id = $1 AND round_number = $2 AND pool_id = $3 AND judge_token = $4`,
    [divisionId, roundNumber, poolId(poolLetter), judgeToken]
  );
  return result.rows[0]?.ranking ?? null;
}

export async function saveBallot(
  eventId: string,
  divisionId: string,
  roundNumber: number,
  poolLetter: string,
  judgeToken: string,
  ranking: Ranking
): Promise<void> {
  await pool.query(
    `INSERT INTO simple_ranking_ballots (event_id, division_id, round_number, pool_id, judge_token, ranking, submitted_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, now())
     ON CONFLICT (division_id, round_number, pool_id, judge_token)
     DO UPDATE SET ranking = EXCLUDED.ranking, submitted_at = now()`,
    [eventId, divisionId, roundNumber, poolId(poolLetter), judgeToken, JSON.stringify(ranking)]
  );
}

export async function deleteBallots(divisionId: string, roundNumber: number, poolLetter: string): Promise<number> {
  const result = await pool.query(
    `DELETE FROM simple_ranking_ballots WHERE division_id = $1 AND round_number = $2 AND pool_id = $3`,
    [divisionId, roundNumber, poolId(poolLetter)]
  );
  return result.rowCount ?? 0;
}

export type SimpleRankingResultsRow = SimpleRankingResult & { teams: { id: string; name: string }[] };

// The pool's teams (play order) and every judge's aggregated results, for the
// Head Judge's Results tab.
export async function getSimpleRankingResults(
  divisionId: string,
  divisionName: string,
  roundNumber: number,
  poolLetter: string
): Promise<SimpleRankingResultsRow> {
  const [teams, ballots] = await Promise.all([
    getTeams(divisionId, divisionName),
    pool.query<{ ranking: string[] }>(
      `SELECT ranking FROM simple_ranking_ballots WHERE division_id = $1 AND round_number = $2 AND pool_id = $3`,
      [divisionId, roundNumber, poolId(poolLetter)]
    ),
  ]);
  const inPool = sortPoolTeams(teams.filter((t) => t.round_number === roundNumber && t.pool_id === poolId(poolLetter)));
  const teamRefs = inPool.map((t) => ({ id: t.id, name: t.players.map((p) => p.name).join(' / ') || '(no players)' }));
  const result = aggregate(
    teamRefs.map((t) => t.id),
    ballots.rows.map((r) => r.ranking)
  );
  return { ...result, teams: teamRefs };
}

