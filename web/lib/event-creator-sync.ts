import 'server-only';
import crypto from 'node:crypto';
import { pool } from './db';
import { ROSTER_ROUND, ROSTER_POOL } from './event-creator';
import { teamKey } from './event-creator-layout';

type Identified = { round_number: number; playerIds: string[] };

// Player sets that play in some round but aren't on the roster yet (one per set).
function missingFromRoster(teams: Identified[]): string[][] {
  const onRoster = new Set(teams.filter((t) => t.round_number === ROSTER_ROUND).map((t) => teamKey(t.playerIds)));
  const missing = new Map<string, string[]>();
  for (const t of teams) {
    if (t.round_number === ROSTER_ROUND || t.playerIds.length === 0) continue;
    const key = teamKey(t.playerIds);
    if (!onRoster.has(key) && !missing.has(key)) missing.set(key, t.playerIds);
  }
  return [...missing.values()];
}

// The division's team list lives in the DB as roster rows (round 0). Imported
// events only have teams inside round pools, so any team found there that
// isn't on the roster yet is added to it. `teams` is what the caller already
// loaded (the common case, nothing to add, costs no extra query). Returns
// true when rows were added, so the caller knows to reload.
export async function syncRosterFromRounds(
  divisionId: string,
  teams: { round_number: number; players: { id: string }[] }[]
): Promise<boolean> {
  const loaded = teams.map((t) => ({ round_number: t.round_number, playerIds: t.players.map((p) => p.id) }));
  if (missingFromRoster(loaded).length === 0) return false;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Concurrent renders (every division tab renders up front) must not both insert.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [divisionId]);

    const fresh = await client.query<{ round_number: number; player_ids: string[] }>(
      `SELECT t.round_number, array_agg(tp.player_id::text) AS player_ids
       FROM teams t JOIN team_players tp ON tp.team_id = t.id
       WHERE t.division_id = $1
       GROUP BY t.id`,
      [divisionId]
    );
    const missing = missingFromRoster(fresh.rows.map((r) => ({ round_number: r.round_number, playerIds: r.player_ids })));
    if (missing.length === 0) {
      await client.query('COMMIT');
      return false;
    }

    const teamIds = missing.map(() => crypto.randomUUID());
    await client.query(
      `INSERT INTO teams (id, division_id, round_number, pool_id)
       SELECT id, $1, $2, $3 FROM unnest($4::uuid[]) AS id`,
      [divisionId, ROSTER_ROUND, ROSTER_POOL, teamIds]
    );
    await client.query(
      `INSERT INTO team_players (id, team_id, player_id)
       SELECT gen_random_uuid(), team_id, player_id FROM unnest($1::uuid[], $2::uuid[]) AS x(team_id, player_id)`,
      [teamIds.flatMap((id, i) => missing[i].map(() => id)), missing.flat()]
    );
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
