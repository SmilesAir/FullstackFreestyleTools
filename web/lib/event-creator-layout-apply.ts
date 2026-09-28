import 'server-only';
import type { QueryResult, QueryResultRow } from 'pg';
import { POOL_LETTERS, poolId } from './event-creator';
import { isPoolLocked, POOL_LOCKED_ERROR } from './pool-locks';

// The plumbing `setRoundLayout`/`addTeamToRound` (event-creator-actions.ts) share, plus
// the bridge (web/lib/bridge/postgres-writer.ts). Pulled out of that 'use server' file so
// the bridge — which has no user session to guard with `requirePermission` — can call the
// exact same validated logic without either function becoming reachable as a client-callable
// server action with no permission check.

export type DbClient = { query: <T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<QueryResult<T>> };

export async function insertTeam(client: DbClient, divisionId: string, roundNumber: number, pool_id: string, playerIds: string[]): Promise<string> {
  const team = await client.query<{ id: string }>(
    `INSERT INTO teams (id, division_id, round_number, pool_id) VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
    [divisionId, roundNumber, pool_id]
  );
  for (const playerId of playerIds) {
    await client.query('INSERT INTO team_players (id, team_id, player_id) VALUES (gen_random_uuid(), $1, $2)', [
      team.rows[0].id,
      playerId,
    ]);
  }
  return team.rows[0].id;
}

// Validates `layout` against the round's current teams and writes it. Returns an error
// message, or null on success. `layout` is pool letter -> team ids in play order and must
// name every team currently in the round exactly once, so a stale caller can't silently
// drop teams. Only pool_id and play_order change; place and points are results and stay.
export async function applyRoundLayout(
  db: DbClient,
  divisionId: string,
  roundNumber: number,
  layout: Record<string, string[]>
): Promise<string | null> {
  if (Object.keys(layout).some((letter) => !(POOL_LETTERS as readonly string[]).includes(letter))) {
    return 'Unknown pool';
  }

  // A locked pool's own teams and their order can't change; other pools of the
  // same round can still be rearranged in the same call (every team of the
  // round has to be named somewhere in `layout`, including a locked pool's, so
  // this checks whether that pool's own list actually differs, not just whether
  // it was named).
  const lockedLetters: string[] = [];
  for (const letter of Object.keys(layout)) {
    if (await isPoolLocked(divisionId, roundNumber, poolId(letter))) lockedLetters.push(letter);
  }
  if (lockedLetters.length > 0) {
    const stored = await db.query<{ id: string; pool_id: string; play_order: number | null }>(
      'SELECT id, pool_id, play_order FROM teams WHERE division_id = $1 AND round_number = $2',
      [divisionId, roundNumber]
    );
    for (const letter of lockedLetters) {
      const inPool = stored.rows.filter((r) => r.pool_id === poolId(letter));
      // Once a round has ever been arranged, every team in it has a play_order
      // and that alone determines the order (matching sortPoolTeams); before
      // that (fresh from seeding) the order isn't pinned down the same way on
      // both sides, so play it safe and refuse any submission naming this pool.
      if (inPool.some((r) => r.play_order === null)) return POOL_LOCKED_ERROR;
      const have = inPool.sort((a, b) => (a.play_order as number) - (b.play_order as number)).map((r) => r.id);
      if (JSON.stringify(layout[letter] ?? []) !== JSON.stringify(have)) return POOL_LOCKED_ERROR;
    }
  }

  const ids: string[] = [];
  const pools: string[] = [];
  const orders: number[] = [];
  for (const [letter, teamIds] of Object.entries(layout)) {
    teamIds.forEach((id, i) => {
      ids.push(id);
      pools.push(poolId(letter));
      orders.push(i + 1);
    });
  }

  const current = await db.query<{ id: string }>('SELECT id FROM teams WHERE division_id = $1 AND round_number = $2', [
    divisionId,
    roundNumber,
  ]);
  const currentIds = new Set(current.rows.map((r) => r.id));
  if (new Set(ids).size !== ids.length || ids.length !== currentIds.size || ids.some((id) => !currentIds.has(id))) {
    return 'This round changed since the page loaded; refresh and try again';
  }

  await db.query(
    `UPDATE teams t SET pool_id = v.pool_id, play_order = v.play_order
     FROM unnest($1::uuid[], $2::text[], $3::int[]) AS v(id, pool_id, play_order)
     WHERE t.id = v.id AND t.division_id = $4 AND t.round_number = $5`,
    [ids, pools, orders, divisionId, roundNumber]
  );
  return null;
}
