import 'server-only';
import { pool } from '../db';
import { defaultRoutineSeconds, poolId, ROSTER_POOL, ROSTER_ROUND, type RulesId } from '../event-creator';
import { insertTeam, applyRoundLayout } from '../event-creator-layout-apply';
import { teamKey } from '../event-creator-layout';
import { setPoolLockedRow } from '../pool-locks';
import type { CanonicalPoolLayout } from './mapping';

// The Postgres side of the bridge's writes. Never raw enough to bypass the same rules the
// guarded actions enforce (a locked pool still refuses a rearrangement, via the shared
// applyRoundLayout/setPoolLockedRow this reuses) - it just has no user session to check,
// since its only caller is the cron-secret-authenticated reconciliation job, not a person.

// A targeted rename (e.g. resolving an eventName conflict) that touches nothing else.
export async function updateEventName(eventId: string, eventName: string): Promise<void> {
  await pool.query('UPDATE events SET event_name = $2 WHERE id = $1', [eventId, eventName]);
}

export async function createDivisionIfMissing(
  eventId: string,
  divisionName: string,
  routineSeconds: number,
  rulesId: RulesId = 'Fpa2020'
): Promise<string> {
  const existing = await pool.query<{ id: string }>('SELECT id FROM divisions WHERE event_id = $1 AND division_name = $2', [
    eventId,
    divisionName,
  ]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO divisions (id, event_id, division_name, raw_text, is_hidden, created_at, routine_seconds, rules_id)
     VALUES (gen_random_uuid(), $1, $2, '', false, now(), $3, $4) RETURNING id`,
    [eventId, divisionName, routineSeconds || defaultRoutineSeconds(divisionName), rulesId]
  );
  return inserted.rows[0].id;
}

// Adds any roster team (division_id, round_number = 0) not already present, matched by its
// player-id set (the same identity rule the rest of the app uses - see teamKey). Returns how
// many were actually new.
export async function addMissingRosterTeams(divisionId: string, playerIdLists: string[][]): Promise<number> {
  const existing = await pool.query<{ player_ids: string[] }>(
    `SELECT array_agg(tp.player_id::text ORDER BY tp.id) AS player_ids
     FROM teams t JOIN team_players tp ON tp.team_id = t.id
     WHERE t.division_id = $1 AND t.round_number = $2
     GROUP BY t.id`,
    [divisionId, ROSTER_ROUND]
  );
  const haveKeys = new Set(existing.rows.map((r) => teamKey(r.player_ids)));
  const missing = playerIdLists.filter((ids) => ids.length > 0 && !haveKeys.has(teamKey(ids)));
  for (const playerIds of missing) await insertTeam(pool, divisionId, ROSTER_ROUND, ROSTER_POOL, playerIds);
  return missing.length;
}

// Every team currently in a round, as a letter -> team-id list (in play order) plus a
// teamKey -> team-id lookup, so a canonical (player-id-based) layout can be translated into
// the team-id-based shape applyRoundLayout needs.
async function getRoundLayoutIds(divisionId: string, roundNumber: number) {
  const teams = await pool.query<{ id: string; pool_id: string; play_order: number | null; player_ids: string[] }>(
    `SELECT t.id, t.pool_id, t.play_order, array_agg(tp.player_id::text ORDER BY tp.id) AS player_ids
     FROM teams t JOIN team_players tp ON tp.team_id = t.id
     WHERE t.division_id = $1 AND t.round_number = $2
     GROUP BY t.id, t.pool_id, t.play_order`,
    [divisionId, roundNumber]
  );
  const layout: Record<string, string[]> = {};
  const byTeamKey = new Map<string, string>();
  for (const t of [...teams.rows].sort((a, b) => (a.play_order ?? 0) - (b.play_order ?? 0))) {
    const letter = t.pool_id.replace(/^pool/i, '').toUpperCase();
    (layout[letter] ??= []).push(t.id);
    byTeamKey.set(teamKey(t.player_ids), t.id);
  }
  return { layout, byTeamKey };
}

// Applies one pool's canonical layout (team play order + lock) from the other side. Any team
// named in `canonical.order` that this round doesn't have yet is inserted into it first
// (matched by player-id set); everything else in the round keeps its current arrangement -
// only this pool's own list changes. Returns an error string (e.g. the pool is locked with a
// genuinely different order already) instead of throwing, so the caller can log and move on.
export async function applyPoolLayout(
  divisionId: string,
  roundNumber: number,
  letter: string,
  canonical: CanonicalPoolLayout
): Promise<string | null> {
  const { layout, byTeamKey } = await getRoundLayoutIds(divisionId, roundNumber);

  const orderedIds: string[] = [];
  for (const playerIds of canonical.order) {
    const key = teamKey(playerIds);
    let teamId = byTeamKey.get(key);
    if (!teamId) {
      teamId = await insertTeam(pool, divisionId, roundNumber, poolId(letter), playerIds);
      byTeamKey.set(key, teamId);
    }
    orderedIds.push(teamId);
  }

  const fullLayout = { ...layout, [letter]: orderedIds };
  const layoutError = await applyRoundLayout(pool, divisionId, roundNumber, fullLayout);
  if (layoutError) return layoutError;

  const lockResult = await setPoolLockedRow(divisionId, roundNumber, poolId(letter), canonical.locked);
  return lockResult.error;
}

// Writes a pool's finished place/score, once it's known to be finished (see
// mapping.ts/postgres-reader.ts - null on either side means "not finished yet", so the
// caller never calls this with a partial result).
export async function applyPoolResult(divisionId: string, roundNumber: number, letter: string, result: Record<string, { score: number; place: number }>): Promise<void> {
  const teams = await pool.query<{ id: string; player_ids: string[] }>(
    `SELECT t.id, array_agg(tp.player_id::text ORDER BY tp.id) AS player_ids
     FROM teams t JOIN team_players tp ON tp.team_id = t.id
     WHERE t.division_id = $1 AND t.round_number = $2 AND t.pool_id = $3
     GROUP BY t.id`,
    [divisionId, roundNumber, poolId(letter)]
  );
  for (const t of teams.rows) {
    const found = result[teamKey(t.player_ids)];
    if (!found) continue;
    await pool.query('UPDATE teams SET place = $2, points = $3 WHERE id = $1', [t.id, found.place, found.score]);
  }
}
