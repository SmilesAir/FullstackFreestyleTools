'use server';

import { redirect } from 'next/navigation';
import { requirePermission } from './authz';
import { pool } from './db';
import {
  DIVISION_NAMES,
  RULES_IDS,
  JUDGE_CATEGORIES,
  ROUTINE_MINUTES,
  defaultRoutineSeconds,
  ROSTER_ROUND,
  ROSTER_POOL,
  POOL_LETTERS,
  ROUNDS,
  poolId,
  getRoundConfig,
  type PoolConfig,
  type PoolJudge,
  type RulesId,
} from './event-creator';
import { getTeams } from './event-creator-queries';
import { seedRound } from './event-creator-seeding';
import { teamKey } from './event-creator-layout';

export type ActionState = { error: string | null };

const guard = () => requirePermission('event_creator');

export async function createEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await guard();
  const name = String(formData.get('event_name') ?? '').trim();
  const start = String(formData.get('start_date') ?? '');
  const end = String(formData.get('end_date') ?? '');
  if (!name) return { error: 'Event name is required' };
  if (!start || !end) return { error: 'Start and end dates are required' };
  if (end < start) return { error: 'End date is before the start date' };

  const client = await pool.connect();
  let eventId: string;
  let firstDivisionId: string;
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string }>(
      `INSERT INTO events (id, event_name, start_date, end_date, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, now()) RETURNING id`,
      [name, start, end]
    );
    eventId = result.rows[0].id;
    // One draft division per standard division; each gets its own tab.
    const ids: string[] = [];
    for (const divisionName of DIVISION_NAMES) {
      const d = await client.query<{ id: string }>(
        `INSERT INTO divisions (id, event_id, division_name, raw_text, is_hidden, created_at, routine_seconds)
         VALUES (gen_random_uuid(), $1, $2, '', true, now(), $3) RETURNING id`,
        [eventId, divisionName, defaultRoutineSeconds(divisionName)]
      );
      ids.push(d.rows[0].id);
    }
    firstDivisionId = ids[0];
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return { error: err instanceof Error ? err.message : 'Failed to create event' };
  } finally {
    client.release();
  }
  redirect(`/events?event=${eventId}&division=${firstDivisionId}`);
}

export async function addDivision(eventId: string, divisionName: string): Promise<ActionState & { id?: string }> {
  await guard();
  if (!(DIVISION_NAMES as readonly string[]).includes(divisionName)) return { error: 'Unknown division' };
  const exists = await pool.query('SELECT 1 FROM divisions WHERE event_id = $1 AND division_name = $2', [
    eventId,
    divisionName,
  ]);
  if (exists.rows.length > 0) return { error: `${divisionName} already exists for this event` };

  // Starts hidden (a draft) with no scraped text; publish flips is_hidden.
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO divisions (id, event_id, division_name, raw_text, is_hidden, created_at, routine_seconds)
     VALUES (gen_random_uuid(), $1, $2, '', true, now(), $3) RETURNING id`,
    [eventId, divisionName, defaultRoutineSeconds(divisionName)]
  );
  return { error: null, id: inserted.rows[0].id };
}

// Only drafts can be deleted; this also removes the division's teams.
export async function deleteDivision(divisionId: string): Promise<ActionState> {
  await guard();
  const result = await pool.query('DELETE FROM divisions WHERE id = $1 AND is_hidden = true', [divisionId]);
  if (result.rowCount === 0) return { error: 'Only draft (unpublished) divisions can be deleted' };
  return { error: null };
}

export async function updateDivisionSettings(
  divisionId: string,
  settings: {
    divisionName: string;
    routineMinutes: number;
    rulesId: string;
    headJudgeId: string | null;
    directorIds: string[];
  }
): Promise<ActionState> {
  await guard();
  if (!(DIVISION_NAMES as readonly string[]).includes(settings.divisionName)) return { error: 'Unknown division type' };
  if (!(ROUTINE_MINUTES as readonly number[]).includes(settings.routineMinutes)) return { error: 'Routine time must be 3, 4, or 5 minutes' };
  if (!(RULES_IDS as readonly string[]).includes(settings.rulesId)) return { error: 'Unknown rules' };

  const current = await pool.query<{ event_id: string }>('SELECT event_id FROM divisions WHERE id = $1', [divisionId]);
  if (!current.rows[0]) return { error: 'Division not found' };
  const clash = await pool.query('SELECT 1 FROM divisions WHERE event_id = $1 AND division_name = $2 AND id <> $3', [
    current.rows[0].event_id,
    settings.divisionName,
    divisionId,
  ]);
  if (clash.rows.length > 0) return { error: `This event already has a ${settings.divisionName} division` };

  await pool.query(
    `UPDATE divisions
     SET division_name = $2, routine_seconds = $3, rules_id = $4, head_judge_player_id = $5, director_player_ids = $6
     WHERE id = $1`,
    [divisionId, settings.divisionName, settings.routineMinutes * 60, settings.rulesId, settings.headJudgeId, settings.directorIds]
  );
  return { error: null };
}

export async function setPublished(divisionId: string, published: boolean): Promise<ActionState> {
  await guard();
  await pool.query('UPDATE divisions SET is_hidden = $2 WHERE id = $1', [divisionId, !published]);
  return { error: null };
}

async function updatePoolConfig(divisionId: string, mutate: (config: PoolConfig) => void) {
  const row = await pool.query<{ pool_config: PoolConfig }>('SELECT pool_config FROM divisions WHERE id = $1', [
    divisionId,
  ]);
  const config: PoolConfig = row.rows[0]?.pool_config ?? {};
  config.rounds ??= {};
  mutate(config);
  await pool.query('UPDATE divisions SET pool_config = $2 WHERE id = $1', [divisionId, JSON.stringify(config)]);
}

export async function setRoundConfig(
  divisionId: string,
  roundNumber: number,
  poolCount: number
): Promise<ActionState> {
  await guard();
  if (roundNumber < 1 || roundNumber > 4) return { error: 'Unknown round' };
  if (!Number.isInteger(poolCount) || poolCount < 1 || poolCount > POOL_LETTERS.length) {
    return { error: `Pool count must be 1–${POOL_LETTERS.length}` };
  }
  if (roundNumber === 1 && poolCount !== 1) return { error: 'Finals must have exactly 1 pool' };

  await updatePoolConfig(divisionId, (config) => {
    config.rounds![String(roundNumber)] = { poolCount };
  });
  return { error: null };
}

// Replaces the judges of one pool. Each is a player judging that pool in one
// category, and the category must be one the division's rules use.
export async function setPoolJudges(
  divisionId: string,
  roundNumber: number,
  poolLetter: string,
  judges: PoolJudge[]
): Promise<ActionState> {
  await guard();
  if (!(POOL_LETTERS as readonly string[]).includes(poolLetter)) return { error: 'Unknown pool' };
  if (!Number.isInteger(roundNumber) || roundNumber < 1) return { error: 'Unknown round' };
  if (new Set(judges.map((j) => j.playerId)).size !== judges.length) {
    return { error: 'A player can only judge a pool once' };
  }

  const division = await pool.query<{ rules_id: string }>('SELECT rules_id FROM divisions WHERE id = $1', [divisionId]);
  if (!division.rows[0]) return { error: 'Division not found' };
  const allowed: readonly string[] = JUDGE_CATEGORIES[division.rows[0].rules_id as RulesId] ?? [];
  if (judges.some((j) => !allowed.includes(j.categoryType))) {
    return { error: allowed.length ? `Judge category must be one of: ${allowed.join(', ')}` : "These rules don't use judge categories" };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM pool_judges WHERE division_id = $1 AND round_number = $2 AND pool_id = $3', [
      divisionId,
      roundNumber,
      poolId(poolLetter),
    ]);
    if (judges.length > 0) {
      await client.query(
        `INSERT INTO pool_judges (id, division_id, round_number, pool_id, player_id, category_type)
         SELECT gen_random_uuid(), $1, $2, $3, x.player_id, x.category_type
         FROM unnest($4::uuid[], $5::text[]) AS x(player_id, category_type)`,
        [divisionId, roundNumber, poolId(poolLetter), judges.map((j) => j.playerId), judges.map((j) => j.categoryType)]
      );
    }
    await client.query('COMMIT');
    return { error: null };
  } catch (err) {
    await client.query('ROLLBACK');
    // 23503: no such player; 22P02: not a valid id at all.
    const code = (err as { code?: string }).code;
    if (code === '23503' || code === '22P02') return { error: 'One of those players no longer exists' };
    return { error: err instanceof Error ? err.message : 'Failed to save the judges' };
  } finally {
    client.release();
  }
}

async function insertTeam(
  client: { query: typeof pool.query },
  divisionId: string,
  roundNumber: number,
  pool_id: string,
  playerIds: string[]
): Promise<string> {
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

export async function addRosterTeams(divisionId: string, teams: string[][]): Promise<ActionState & { added?: number }> {
  await guard();
  const valid = teams.filter((t) => t.length > 0 && new Set(t).size === t.length);
  if (valid.length === 0) return { error: 'No complete teams to add' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const playerIds of valid) await insertTeam(client, divisionId, ROSTER_ROUND, ROSTER_POOL, playerIds);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return { error: err instanceof Error ? err.message : 'Failed to add teams' };
  } finally {
    client.release();
  }
  return { error: null, added: valid.length };
}

export async function deleteRosterTeam(divisionId: string, teamId: string): Promise<ActionState> {
  await guard();

  // A team that still plays in a round would just be re-added from that round
  // the next time the division loads, so it has to leave the rounds first.
  const teams = await pool.query<{ id: string; round_number: number; player_ids: string[] }>(
    `SELECT t.id, t.round_number, array_agg(tp.player_id::text) AS player_ids
     FROM teams t JOIN team_players tp ON tp.team_id = t.id
     WHERE t.division_id = $1
     GROUP BY t.id`,
    [divisionId]
  );
  const mine = teams.rows.find((t) => t.id === teamId);
  if (mine) {
    const key = teamKey(mine.player_ids);
    const inRound = teams.rows.find((t) => t.round_number !== ROSTER_ROUND && teamKey(t.player_ids) === key);
    if (inRound) {
      const name = ROUNDS.find((r) => r.number === inRound.round_number)?.name ?? `round ${inRound.round_number}`;
      return { error: `This team is still in ${name}; clear that round first` };
    }
  }

  await pool.query('DELETE FROM teams WHERE id = $1 AND division_id = $2 AND round_number = $3', [
    teamId,
    divisionId,
    ROSTER_ROUND,
  ]);
  return { error: null };
}

export async function seedRoundFromRankings(
  divisionId: string,
  roundNumber: number
): Promise<ActionState & { seeded?: number; byes?: number }> {
  await guard();
  if (roundNumber < 1 || roundNumber > 4) return { error: 'Unknown round' };

  const division = await pool.query<{ division_name: string; pool_config: PoolConfig }>(
    'SELECT division_name, pool_config FROM divisions WHERE id = $1',
    [divisionId]
  );
  if (!division.rows[0]) return { error: 'Division not found' };
  const { division_name, pool_config } = division.rows[0];

  const all = await getTeams(divisionId, division_name);
  const roster = all
    .filter((t) => t.round_number === ROSTER_ROUND)
    .sort((a, b) => a.points - b.points || a.id.localeCompare(b.id));
  if (roster.length === 0) return { error: 'Add teams to the roster first' };

  const { poolCount } = getRoundConfig(pool_config ?? {}, roundNumber);
  let seeding;
  try {
    seeding = seedRound(
      roster.map((t) => t.id),
      roundNumber,
      poolCount
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to seed' };
  }

  const playersByTeam = new Map(roster.map((t) => [t.id, t.players.map((p) => p.id)]));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Re-seeding only replaces this round's rows; roster and other rounds stay.
    await client.query('DELETE FROM teams WHERE division_id = $1 AND round_number = $2', [divisionId, roundNumber]);
    for (let i = 0; i < seeding.pools.length; i++) {
      for (const rosterTeamId of seeding.pools[i]) {
        await insertTeam(client, divisionId, roundNumber, poolId(POOL_LETTERS[i]), playersByTeam.get(rosterTeamId) ?? []);
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return { error: err instanceof Error ? err.message : 'Failed to seed' };
  } finally {
    client.release();
  }

  return { error: null, seeded: seeding.pools.reduce((n, p) => n + p.length, 0), byes: seeding.byes.length };
}

export async function clearRound(divisionId: string, roundNumber: number): Promise<ActionState> {
  await guard();
  if (roundNumber < 1 || roundNumber > 4) return { error: 'Unknown round' };
  await pool.query('DELETE FROM teams WHERE division_id = $1 AND round_number = $2', [divisionId, roundNumber]);
  return { error: null };
}

// Saves how a round's pools are arranged: which pool each team is in and the
// order they play. `layout` is pool letter -> team ids in play order and must
// name every team currently in the round exactly once, so a stale tab can't
// silently drop teams. Only pool_id and play_order change; place and points are
// results and stay as they are.
export async function setRoundLayout(
  divisionId: string,
  roundNumber: number,
  layout: Record<string, string[]>
): Promise<ActionState> {
  await guard();
  if (!Number.isInteger(roundNumber) || roundNumber < 1) return { error: 'Unknown round' };
  return { error: await applyRoundLayout(pool, divisionId, roundNumber, layout) };
}

// Validates `layout` against the round's current teams and writes it. Returns
// an error message, or null on success.
async function applyRoundLayout(
  db: { query: typeof pool.query },
  divisionId: string,
  roundNumber: number,
  layout: Record<string, string[]>
): Promise<string | null> {
  if (Object.keys(layout).some((letter) => !(POOL_LETTERS as readonly string[]).includes(letter))) {
    return 'Unknown pool';
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

// Adds a team from the division's team list to a round, at the spot the user
// dropped it. `layout` is the round's whole arrangement (as for setRoundLayout)
// with the team list entry's own id standing in for the new row, which doesn't
// exist yet. A team can only be in a round once (teams are the same team when
// they have the same players), checked here under a lock so two drops at once
// can't both get in.
export async function addTeamToRound(
  divisionId: string,
  roundNumber: number,
  rosterTeamId: string,
  layout: Record<string, string[]>
): Promise<ActionState> {
  await guard();
  if (!Number.isInteger(roundNumber) || roundNumber < 1) return { error: 'Unknown round' };
  const letter = Object.keys(layout).find((l) => layout[l].includes(rosterTeamId));
  if (!letter || !(POOL_LETTERS as readonly string[]).includes(letter)) return { error: 'Unknown pool' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${divisionId}:${roundNumber}`]);

    const found = await client.query<{ id: string; round_number: number; player_ids: string[] }>(
      `SELECT t.id, t.round_number, array_agg(tp.player_id::text) AS player_ids
       FROM teams t JOIN team_players tp ON tp.team_id = t.id
       WHERE t.division_id = $1 AND t.round_number IN ($2, $3)
       GROUP BY t.id`,
      [divisionId, ROSTER_ROUND, roundNumber]
    );
    const source = found.rows.find((r) => r.id === rosterTeamId && r.round_number === ROSTER_ROUND);
    if (!source) {
      await client.query('ROLLBACK');
      return { error: "That team isn't on this division's team list" };
    }
    const key = teamKey(source.player_ids);
    if (found.rows.some((r) => r.round_number === roundNumber && teamKey(r.player_ids) === key)) {
      await client.query('ROLLBACK');
      return { error: 'That team is already in this round' };
    }

    const newId = await insertTeam(client, divisionId, roundNumber, poolId(letter), source.player_ids);
    const withNewId = Object.fromEntries(
      Object.entries(layout).map(([l, ids]) => [l, ids.map((id) => (id === rosterTeamId ? newId : id))])
    );
    const error = await applyRoundLayout(client, divisionId, roundNumber, withNewId);
    if (error) {
      await client.query('ROLLBACK');
      return { error };
    }
    await client.query('COMMIT');
    return { error: null };
  } catch (err) {
    await client.query('ROLLBACK');
    return { error: err instanceof Error ? err.message : 'Failed to add the team' };
  } finally {
    client.release();
  }
}

// Takes a team out of a round's pool (it stays on the division's team list).
// A team with a place has a recorded result and can never be removed.
export async function removeTeamFromRound(divisionId: string, roundNumber: number, teamId: string): Promise<ActionState> {
  await guard();
  if (!Number.isInteger(roundNumber) || roundNumber < 1) return { error: 'Unknown round' };

  const deleted = await pool.query(
    'DELETE FROM teams WHERE id = $1 AND division_id = $2 AND round_number = $3 AND place IS NULL',
    [teamId, divisionId, roundNumber]
  );
  if (deleted.rowCount === 0) {
    const exists = await pool.query('SELECT 1 FROM teams WHERE id = $1 AND division_id = $2 AND round_number = $3', [
      teamId,
      divisionId,
      roundNumber,
    ]);
    return { error: exists.rows.length > 0 ? "This team has a result (place) and can't be removed" : 'Team not found' };
  }
  return { error: null };
}

// Splits "First Last" at the final space (the rest is the first name).
export async function quickCreatePlayer(
  fullName: string
): Promise<{ error: string | null; player?: { id: string; name: string } }> {
  await guard();
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  const idx = trimmed.lastIndexOf(' ');
  if (idx < 1) return { error: 'Need a first and last name to create a player' };
  const first = trimmed.slice(0, idx);
  const last = trimmed.slice(idx + 1);

  const result = await pool.query<{ id: string }>(
    `INSERT INTO players (id, first_name, last_name, created_at, last_active, hidden)
     VALUES (gen_random_uuid(), $1, $2, now(), now(), false) RETURNING id`,
    [first, last]
  );
  return { error: null, player: { id: result.rows[0].id, name: `${first} ${last}` } };
}
