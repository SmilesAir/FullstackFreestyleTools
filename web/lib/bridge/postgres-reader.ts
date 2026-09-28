import 'server-only';
import { pool } from '../db';
import { getRoundConfig, poolId, ROUNDS, type PoolConfig } from '../event-creator';
import { teamKey } from '../event-creator-layout';
import { isPoolLocked } from '../pool-locks';
import type { CanonicalEvent, CanonicalPoolLayout, CanonicalPoolResult } from './mapping';

const roundNumberByName = new Map<string, number>(ROUNDS.map((r) => [r.name, r.number]));
export const roundNameByNumber = (n: number) => ROUNDS.find((r) => r.number === n)?.name ?? `Round ${n}`;
export const roundNumberForName = (name: string): number | null => roundNumberByName.get(name) ?? null;

// For event-summary-service's own entry (see dynamo-writer.ts's pushEventSummaryToDynamo) -
// separate from the canonical event view below, since that index isn't part of the 3-way
// diff, just kept caught up whenever a bridged event is reconciled.
export async function getEventSummaryFields(eventId: string): Promise<{ eventName: string; startDate: string; endDate: string } | null> {
  const result = await pool.query<{ event_name: string; start_date: string; end_date: string }>(
    'SELECT event_name, start_date::text, end_date::text FROM events WHERE id = $1',
    [eventId]
  );
  const row = result.rows[0];
  return row ? { eventName: row.event_name, startDate: row.start_date, endDate: row.end_date } : null;
}

export type DivisionForEventResults = {
  id: string;
  divisionName: string;
  isHidden: boolean;
};

// Every division of an event, for event-results-service's own entries (see
// dynamo-writer.ts's pushEventResultsToDynamo) - separate from the canonical event view
// above, since that index isn't part of the 3-way diff either.
export async function getDivisionsForEventResults(eventId: string): Promise<DivisionForEventResults[]> {
  const result = await pool.query<{ id: string; division_name: string; is_hidden: boolean | null }>(
    'SELECT id, division_name, is_hidden FROM divisions WHERE event_id = $1',
    [eventId]
  );
  return result.rows.map((r) => ({ id: r.id, divisionName: r.division_name, isHidden: r.is_hidden ?? false }));
}

// resultsData in event-results-service's own shape: { eventId, divisionName, round1: { id,
// poolA: { poolId, teamData: [{ players, place, points }] } }, ... } - built from the same
// played-round teams (round_number >= 1) getHeadJudgePools etc. already read, grouped by
// round then pool, each pool's teams ordered by place (unplaced last, in play_order).
export async function getDivisionResultsData(divisionId: string, eventId: string, divisionName: string): Promise<Record<string, unknown>> {
  const teams = await pool.query<{
    round_number: number;
    pool_id: string;
    place: number | null;
    points: number | null;
    play_order: number | null;
    player_ids: string[];
  }>(
    `SELECT t.round_number, t.pool_id, t.place, t.points, t.play_order,
            array_agg(tp.player_id::text ORDER BY tp.id) AS player_ids
     FROM teams t JOIN team_players tp ON tp.team_id = t.id
     WHERE t.division_id = $1 AND t.round_number >= 1
     GROUP BY t.id, t.round_number, t.pool_id, t.place, t.points, t.play_order`,
    [divisionId]
  );

  type Row = { players: string[]; place?: number; points?: number; playOrder: number };
  const byRoundPool = new Map<string, Map<string, Row[]>>(); // "round1" -> "poolA" -> rows
  for (const t of teams.rows) {
    const roundKey = `round${t.round_number}`;
    const letter = t.pool_id.replace(/^pool/i, '').toUpperCase();
    const poolKey = `pool${letter}`;
    const pools = byRoundPool.get(roundKey) ?? byRoundPool.set(roundKey, new Map()).get(roundKey)!;
    const rows = pools.get(poolKey) ?? pools.set(poolKey, []).get(poolKey)!;
    // A real event-results-service entry always has a numeric points (0 when there's none
    // yet, not missing) - matching that in case whatever reads this assumes a number.
    rows.push({ players: t.player_ids, place: t.place ?? undefined, points: t.points ?? 0, playOrder: t.play_order ?? 0 });
  }

  const rounds: Record<string, Record<string, unknown>> = {};
  for (const [roundKey, pools] of byRoundPool) {
    const roundNumber = Number(roundKey.replace('round', ''));
    const round: Record<string, unknown> = { id: roundNumber };
    for (const [poolKey, rows] of pools) {
      const letter = poolKey.replace('pool', '');
      // Placed teams first (by place); anything unplaced after, in play order.
      const sorted = [...rows].sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity) || a.playOrder - b.playOrder);
      round[poolKey] = {
        poolId: letter,
        teamData: sorted.map((r) => ({ players: r.players, place: r.place, points: r.points })),
      };
    }
    rounds[roundKey] = round;
  }

  return { eventId, divisionName, ...rounds };
}

// The event's own divisions in the same canonical shape dynamoEventToCanonical produces,
// so reconcile.ts can diff them without caring which side either came from.
export async function postgresEventToCanonical(eventId: string): Promise<CanonicalEvent | null> {
  const event = await pool.query<{ event_name: string }>('SELECT event_name FROM events WHERE id = $1', [eventId]);
  if (!event.rows[0]) return null;

  const divisions = await pool.query<{
    id: string;
    division_name: string;
    routine_seconds: number;
    pool_config: PoolConfig;
  }>('SELECT id, division_name, routine_seconds, pool_config FROM divisions WHERE event_id = $1', [eventId]);

  const result: CanonicalEvent = { eventName: event.rows[0].event_name, divisions: {} };
  for (const d of divisions.rows) {
    const rounds: CanonicalEvent['divisions'][string]['rounds'] = {};
    for (const round of ROUNDS) {
      const { poolCount } = getRoundConfig(d.pool_config ?? {}, round.number);
      const hasTeams = await pool.query('SELECT 1 FROM teams WHERE division_id = $1 AND round_number = $2 LIMIT 1', [
        d.id,
        round.number,
      ]);
      if (hasTeams.rows.length === 0) continue;
      rounds[round.name] = { poolLetters: [...Array(poolCount)].map((_, i) => String.fromCharCode(65 + i)) };
    }

    // The division's whole roster, not just its unseeded (round_number = 0) staging teams:
    // an event brought in through the Results Parser often has its teams straight in a
    // played round with no roster row at all, and Dynamo has no such staging concept - its
    // "teams" list is just every distinct team on the division. Rows for the same team
    // across several rounds (its roster row, plus wherever it was seeded) collapse into one
    // entry, by player-id set.
    const allTeams = await pool.query<{ player_ids: string[] }>(
      `SELECT array_agg(tp.player_id::text ORDER BY tp.id) AS player_ids
       FROM teams t JOIN team_players tp ON tp.team_id = t.id
       WHERE t.division_id = $1
       GROUP BY t.id`,
      [d.id]
    );
    const seenTeams = new Set<string>();
    const roster: string[][] = [];
    for (const row of allTeams.rows) {
      const key = teamKey(row.player_ids);
      if (seenTeams.has(key)) continue;
      seenTeams.add(key);
      roster.push(row.player_ids);
    }

    result.divisions[d.division_name] = {
      routineSeconds: d.routine_seconds,
      rounds,
      roster,
    };
  }
  return result;
}

export async function findDivisionIdByName(eventId: string, divisionName: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>('SELECT id FROM divisions WHERE event_id = $1 AND division_name = $2', [
    eventId,
    divisionName,
  ]);
  return result.rows[0]?.id ?? null;
}

export async function postgresPoolToCanonical(divisionId: string, roundNumber: number, letter: string): Promise<CanonicalPoolLayout> {
  const locked = await isPoolLocked(divisionId, roundNumber, poolId(letter));
  const teams = await pool.query<{ id: string; play_order: number | null; player_ids: string[] }>(
    `SELECT t.id, t.play_order, array_agg(tp.player_id::text ORDER BY tp.id) AS player_ids
     FROM teams t JOIN team_players tp ON tp.team_id = t.id
     WHERE t.division_id = $1 AND t.round_number = $2 AND t.pool_id = $3
     GROUP BY t.id, t.play_order
     ORDER BY t.play_order NULLS LAST`,
    [divisionId, roundNumber, poolId(letter)]
  );
  return { locked, order: teams.rows.map((t) => t.player_ids) };
}

// null unless the pool is locked *and* every team already has a place. Per the plan, a
// result only syncs once a pool is locked - that's the one "this is done" signal both sides
// already agree on. Checking locked here matters in practice: an event brought in through
// the Results Parser has every team's place filled in from the start (that's what importing
// results means) without anyone ever clicking Lock, since locking is a live-tournament
// Head Judge action that plainly never applies to an already-finished historical import. An
// earlier version of this only checked for a non-null place, which pushed real results for
// pools nobody had actually marked done - fixed before this ever ran for real.
export async function postgresPoolResultToCanonical(
  divisionId: string,
  roundNumber: number,
  letter: string
): Promise<CanonicalPoolResult | null> {
  if (!(await isPoolLocked(divisionId, roundNumber, poolId(letter)))) return null;
  const teams = await pool.query<{ place: number | null; points: number | null; player_ids: string[] }>(
    `SELECT t.place, t.points, array_agg(tp.player_id::text ORDER BY tp.id) AS player_ids
     FROM teams t JOIN team_players tp ON tp.team_id = t.id
     WHERE t.division_id = $1 AND t.round_number = $2 AND t.pool_id = $3
     GROUP BY t.id, t.place, t.points`,
    [divisionId, roundNumber, poolId(letter)]
  );
  if (teams.rows.length === 0 || teams.rows.some((t) => t.place === null)) return null;
  const result: CanonicalPoolResult = {};
  for (const t of teams.rows) result[teamKey(t.player_ids)] = { score: Number(t.points ?? 0), place: t.place as number };
  return result;
}

// Every event currently opted into the bridge (see the plan's "opt in per event" default).
export async function getBridgeEnabledEventIds(): Promise<string[]> {
  const result = await pool.query<{ id: string }>('SELECT id FROM events WHERE bridge_enabled');
  return result.rows.map((r) => r.id);
}
