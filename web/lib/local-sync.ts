import 'server-only';
import type { Pool } from 'pg';
import { getPool } from './db';
import { getModeState, updateModeState, type SyncResult } from './db-mode';
import { getStructureKey } from './head-judge-queries';
import { backupLocal } from './local-backup';

// Keeps the head judge's local Postgres in step with Neon for ONE event.
//
//  - Event setup (the event, divisions, teams, players, pool judges, and the
//    logins) is edited only on Neon. It is pulled down: Neon wins.
//  - What judging creates (routines, notes, scores, play state, the event's
//    judging settings, presets) is made on the local server. It is pushed up:
//    local wins. A hash of every row as last pushed is kept in the local
//    database (local_sync_state), so a push sends only what is new, changed or
//    deleted since, and a push that fails halfway changes nothing and is simply
//    tried again.
//
// Rows travel as to_jsonb(row) text and are written with jsonb_populate_recordset,
// so uuid, timestamptz, jsonb, uuid[] and numeric columns round-trip exactly.

type Queryable = Pick<Pool, 'query'>;

type Spec = {
  table: string;
  pk: string[];
  // Rows of the table in scope, as `s`, for the event ($1) (or all, when the
  // table isn't tied to an event).
  scope: string;
  // Turns a row into the JSON that travels (default: the whole row).
  json?: string;
  // Other unique keys (`@` stands for the table's alias): a row with the same
  // key but another id is removed first, so the incoming one can take its place.
  unique?: string[];
  // Never deleted by a sync, only added and updated.
  keep?: boolean;
  // Columns left as they are on an update.
  skipUpdate?: string[];
};

const quote = (name: string) => `"${name}"`;

const EVENT_PLAYERS = `
  SELECT tp.player_id FROM team_players tp JOIN teams t ON t.id = tp.team_id JOIN divisions d ON d.id = t.division_id WHERE d.event_id = $1
  UNION SELECT pj.player_id FROM pool_judges pj JOIN divisions d ON d.id = pj.division_id WHERE d.event_id = $1
  UNION SELECT d.head_judge_player_id FROM divisions d WHERE d.event_id = $1 AND d.head_judge_player_id IS NOT NULL
  UNION SELECT rp.player_id FROM routine_players rp JOIN routines r ON r.id = rp.routine_id WHERE r.event_id = $1
  UNION SELECT n.player_id FROM fpa2027_judge_notes n WHERE n.event_id = $1
  UNION SELECT sc.judge_player_id FROM fpa2027_judge_scores sc JOIN routines r ON r.id = sc.routine_id WHERE r.event_id = $1`;

const EVENT_ROUTINES = `SELECT id FROM routines WHERE event_id = $1`;

// Parents before children.
const LOGIN_SPECS: Spec[] = [
  // The link to a player row isn't needed to sign in, and the player may not be
  // one of the event's, so it isn't carried.
  { table: 'users', pk: ['id'], scope: `SELECT * FROM users`, json: `to_jsonb(s) - 'player_id'`, unique: ['@.email'] },
  { table: 'permission_groups', pk: ['id'], scope: `SELECT * FROM permission_groups`, unique: ['@.name'] },
  { table: 'group_permissions', pk: ['group_id', 'permission_key'], scope: `SELECT * FROM group_permissions` },
  { table: 'user_permission_groups', pk: ['user_id', 'group_id'], scope: `SELECT * FROM user_permission_groups` },
  { table: 'app_settings', pk: ['key'], scope: `SELECT * FROM app_settings` },
];

const SETUP_SPECS: Spec[] = [
  {
    table: 'players',
    pk: ['id'],
    scope: `SELECT p.* FROM players p
            WHERE p.id IN (${EVENT_PLAYERS})
               OR p.id IN (SELECT a.alias_id FROM players a WHERE a.alias_id IS NOT NULL AND a.id IN (${EVENT_PLAYERS}))`,
    keep: true,
  },
  { table: 'events', pk: ['id'], scope: `SELECT * FROM events WHERE id = $1`, keep: true },
  { table: 'divisions', pk: ['id'], scope: `SELECT * FROM divisions WHERE event_id = $1` },
  {
    table: 'teams',
    pk: ['id'],
    scope: `SELECT t.* FROM teams t JOIN divisions d ON d.id = t.division_id WHERE d.event_id = $1`,
  },
  {
    table: 'team_players',
    pk: ['id'],
    scope: `SELECT tp.* FROM team_players tp JOIN teams t ON t.id = tp.team_id JOIN divisions d ON d.id = t.division_id WHERE d.event_id = $1`,
  },
  {
    table: 'pool_judges',
    pk: ['id'],
    scope: `SELECT pj.* FROM pool_judges pj JOIN divisions d ON d.id = pj.division_id WHERE d.event_id = $1`,
    unique: ['@.division_id', '@.round_number', '@.pool_id', '@.player_id'],
  },
];

// What judging creates.
const JUDGING_SPECS: Spec[] = [
  { table: 'routines', pk: ['id'], scope: `SELECT * FROM routines WHERE event_id = $1` },
  {
    table: 'routine_players',
    pk: ['routine_id', 'player_id'],
    scope: `SELECT * FROM routine_players WHERE routine_id IN (${EVENT_ROUTINES})`,
  },
  { table: 'fpa2027_judge_notes', pk: ['id'], scope: `SELECT * FROM fpa2027_judge_notes WHERE event_id = $1` },
  {
    table: 'fpa2027_judge_scores',
    pk: ['id'],
    scope: `SELECT * FROM fpa2027_judge_scores WHERE routine_id IN (${EVENT_ROUTINES})`,
    unique: ['@.routine_id', '@.judge_player_id', '@.category_type'],
  },
  { table: 'event_play_state', pk: ['event_id'], scope: `SELECT * FROM event_play_state WHERE event_id = $1`, keep: true },
  {
    table: 'judging_presets',
    pk: ['id'],
    scope: `SELECT * FROM judging_presets`,
    unique: ['@.rules_id', 'lower(@.name)'],
    keep: true,
  },
];

const SETTINGS_KEY = 'events.judging_settings';

type Row = { id: string; hash: string; json: string; key: string };

const paramsFor = (spec: Spec, eventId: string) => (spec.scope.includes('$1') ? [eventId] : []);
const pkText = (spec: Spec) => `concat_ws(':', ${spec.pk.map((c) => `s.${quote(c)}`).join(', ')})`;
const pkJson = (spec: Spec) => `jsonb_build_object(${spec.pk.map((c) => `'${c}', s.${quote(c)}`).join(', ')})`;
const jsonOf = (spec: Spec) => spec.json ?? 'to_jsonb(s)';

async function readRows(db: Queryable, spec: Spec, eventId: string): Promise<Row[]> {
  const result = await db.query<{ id: string; hash: string; json: string; key: string }>(
    `SELECT ${pkText(spec)} AS id, md5((${jsonOf(spec)})::text) AS hash, (${jsonOf(spec)})::text AS json, (${pkJson(spec)})::text AS key
     FROM (${spec.scope}) s`,
    paramsFor(spec, eventId)
  );
  return result.rows;
}

const jsonArray = (parts: string[]) => `[${parts.join(',')}]`;

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function deleteKeys(client: Queryable, spec: Spec, keys: string[]) {
  for (const part of chunks(keys, 500)) {
    await client.query(
      `DELETE FROM ${spec.table} USING jsonb_populate_recordset(null::${spec.table}, $1::jsonb) x
       WHERE ${spec.pk.map((c) => `${spec.table}.${quote(c)} = x.${quote(c)}`).join(' AND ')}`,
      [jsonArray(part)]
    );
  }
}

async function upsertRows(client: Queryable, spec: Spec, columns: string[], jsons: string[], skipUpdate: string[]) {
  const updatable = columns.filter((c) => !spec.pk.includes(c) && !skipUpdate.includes(c));
  const onConflict = updatable.length
    ? `DO UPDATE SET ${updatable.map((c) => `${quote(c)} = EXCLUDED.${quote(c)}`).join(', ')}`
    : 'DO NOTHING';
  for (const part of chunks(jsons, 200)) {
    const payload = jsonArray(part);
    if (spec.unique) {
      await client.query(
        `DELETE FROM ${spec.table} WHERE EXISTS (
           SELECT 1 FROM jsonb_populate_recordset(null::${spec.table}, $1::jsonb) x
           WHERE ${spec.unique.map((u) => `${u.replaceAll('@', 'x')} = ${u.replaceAll('@', spec.table)}`).join(' AND ')}
             AND (${spec.pk.map((c) => `x.${quote(c)} <> ${spec.table}.${quote(c)}`).join(' OR ')}))`,
        [payload]
      );
    }
    await client.query(
      `INSERT INTO ${spec.table} SELECT * FROM jsonb_populate_recordset(null::${spec.table}, $1::jsonb)
       ON CONFLICT (${spec.pk.map(quote).join(', ')}) ${onConflict}`,
      [payload]
    );
  }
}

async function columnsOf(db: Queryable, table: string): Promise<string[]> {
  const result = await db.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY column_name`,
    [table]
  );
  return result.rows.map((r) => r.column_name);
}

// The two databases must have the same columns in the tables that travel;
// otherwise something (usually an old schema on the laptop) is out of date.
async function checkSchemas(local: Queryable, remote: Queryable, specs: Spec[]) {
  const problems: string[] = [];
  for (const spec of specs) {
    const [a, b] = await Promise.all([columnsOf(local, spec.table), columnsOf(remote, spec.table)]);
    if (a.length === 0) problems.push(`${spec.table} is missing locally`);
    else if (a.join() !== b.join()) {
      const onlyRemote = b.filter((c) => !a.includes(c));
      const onlyLocal = a.filter((c) => !b.includes(c));
      problems.push(
        `${spec.table} differs (${[onlyRemote.length ? `only on Neon: ${onlyRemote}` : '', onlyLocal.length ? `only local: ${onlyLocal}` : ''].filter(Boolean).join('; ')})`
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(`The local database's schema doesn't match Neon's (run npm run local:setup): ${problems.join('; ')}`);
  }
}

// ---------------------------------------------------------------------------
// Bookkeeping: what was last pushed, kept in the local database only.

async function ensureStateTable(local: Queryable) {
  await local.query(
    `CREATE TABLE IF NOT EXISTS local_sync_state (
       table_name text NOT NULL,
       row_id     text NOT NULL,
       row_hash   text NOT NULL,
       row_key    jsonb NOT NULL,
       PRIMARY KEY (table_name, row_id)
     )`
  );
}

type Diff = { spec: Spec; changed: Row[]; deleted: { id: string; key: string }[]; all: Row[] };
type SettingsDiff = { hash: string; json: string } | null;

async function diffLocal(local: Queryable, eventId: string) {
  await ensureStateTable(local);
  const diffs: Diff[] = [];
  for (const spec of JUDGING_SPECS) {
    const all = await readRows(local, spec, eventId);
    const known = await local.query<{ row_id: string; row_hash: string; row_key: string }>(
      `SELECT row_id, row_hash, row_key::text FROM local_sync_state WHERE table_name = $1`,
      [spec.table]
    );
    const state = new Map(known.rows.map((r) => [r.row_id, r]));
    const present = new Set(all.map((r) => r.id));
    diffs.push({
      spec,
      all,
      changed: all.filter((r) => state.get(r.id)?.row_hash !== r.hash),
      deleted: spec.keep ? [] : known.rows.filter((r) => !present.has(r.row_id)).map((r) => ({ id: r.row_id, key: r.row_key })),
    });
  }
  const settings = await local.query<{ hash: string; json: string }>(
    `SELECT md5(judging_settings::text) AS hash, judging_settings::text AS json FROM events WHERE id = $1`,
    [eventId]
  );
  const savedSettings = await local.query<{ row_hash: string }>(
    `SELECT row_hash FROM local_sync_state WHERE table_name = $1 AND row_id = $2`,
    [SETTINGS_KEY, eventId]
  );
  const settingsDiff: SettingsDiff =
    settings.rows[0] && savedSettings.rows[0]?.row_hash !== settings.rows[0].hash ? settings.rows[0] : null;
  return { diffs, settingsDiff };
}

// How many rows a push would send right now (0 when everything is up to date).
export async function pendingChanges(eventId: string): Promise<number> {
  const { diffs, settingsDiff } = await diffLocal(getPool('local'), eventId);
  return diffs.reduce((n, d) => n + d.changed.length + d.deleted.length, 0) + (settingsDiff ? 1 : 0);
}

// ---------------------------------------------------------------------------
// One sync at a time.

const globalForSync = globalThis as unknown as { syncBusy?: boolean; loginPulledAt?: number };

async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  if (globalForSync.syncBusy) throw new Error('A sync is already running.');
  globalForSync.syncBusy = true;
  try {
    return await fn();
  } finally {
    globalForSync.syncBusy = false;
  }
}

export const isSyncing = () => Boolean(globalForSync.syncBusy);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function record(result: Omit<SyncResult, 'at'>): SyncResult {
  const full = { at: Date.now(), ...result };
  updateModeState({ lastSync: full });
  return full;
}

// ---------------------------------------------------------------------------
// Push: local judging data up to Neon.

async function push(eventId: string): Promise<number> {
  const local = getPool('local');
  const { diffs, settingsDiff } = await diffLocal(local, eventId);
  const count = diffs.reduce((n, d) => n + d.changed.length + d.deleted.length, 0) + (settingsDiff ? 1 : 0);
  if (count === 0) return 0;

  const remote = await getPool('remote').connect();
  try {
    await checkSchemas(local, remote, JUDGING_SPECS);
    const columns = new Map<string, string[]>();
    for (const spec of JUDGING_SPECS) columns.set(spec.table, await columnsOf(remote, spec.table));

    await remote.query('BEGIN');
    try {
      await remote.query(`SET LOCAL statement_timeout = 20000`);
      // Deletes first (children first), then adds and changes (parents first), so
      // a row taking another's place under a unique key never collides.
      for (const d of [...diffs].reverse()) {
        if (d.deleted.length > 0) await deleteKeys(remote, d.spec, d.deleted.map((r) => r.key));
      }
      for (const d of diffs) {
        if (d.changed.length > 0) {
          await upsertRows(remote, d.spec, columns.get(d.spec.table)!, d.changed.map((r) => r.json), []);
        }
      }
      if (settingsDiff) {
        await remote.query(`UPDATE events SET judging_settings = $1::jsonb WHERE id = $2`, [settingsDiff.json, eventId]);
      }
      await remote.query('COMMIT');
    } catch (err) {
      await remote.query('ROLLBACK').catch(() => {});
      throw err;
    }
  } finally {
    remote.release();
  }

  // Neon has it all: remember what was sent (the hashes taken with the rows sent,
  // so anything changed since is sent next time).
  const client = await local.connect();
  try {
    await client.query('BEGIN');
    for (const d of diffs) {
      for (const gone of d.deleted) {
        await client.query(`DELETE FROM local_sync_state WHERE table_name = $1 AND row_id = $2`, [d.spec.table, gone.id]);
      }
      for (const part of chunks(d.changed, 300)) {
        await client.query(
          `INSERT INTO local_sync_state (table_name, row_id, row_hash, row_key)
           SELECT $1, x.id, x.hash, x.key::jsonb FROM jsonb_to_recordset($2::jsonb) AS x(id text, hash text, key text)
           ON CONFLICT (table_name, row_id) DO UPDATE SET row_hash = EXCLUDED.row_hash, row_key = EXCLUDED.row_key`,
          [d.spec.table, JSON.stringify(part.map((r) => ({ id: r.id, hash: r.hash, key: r.key })))]
        );
      }
    }
    if (settingsDiff) {
      await client.query(
        `INSERT INTO local_sync_state (table_name, row_id, row_hash, row_key) VALUES ($1, $2, $3, '{}'::jsonb)
         ON CONFLICT (table_name, row_id) DO UPDATE SET row_hash = EXCLUDED.row_hash`,
        [SETTINGS_KEY, eventId, settingsDiff.hash]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return count;
}

// ---------------------------------------------------------------------------
// Pull: Neon's setup (and, on a full sync, its judging rows too) down.

type PullWhat = { login: boolean; judging: boolean; backupGapMs: number };

async function pull(eventId: string, what: PullWhat): Promise<{ structureKey: string }> {
  const local = getPool('local');
  const specs = [...(what.login ? LOGIN_SPECS : []), ...SETUP_SPECS, ...(what.judging ? JUDGING_SPECS : [])];

  // Neon's rows, all from one snapshot.
  const fetched = new Map<string, { rows: Row[]; columns: string[] }>();
  let structureKey = '';
  const remote = await getPool('remote').connect();
  try {
    await checkSchemas(local, remote, specs);
    await remote.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    try {
      await remote.query(`SET LOCAL statement_timeout = 20000`);
      structureKey = await getStructureKey(eventId, remote);
      for (const spec of specs) {
        fetched.set(spec.table, { rows: await readRows(remote, spec, eventId), columns: await columnsOf(remote, spec.table) });
      }
    } finally {
      await remote.query('ROLLBACK').catch(() => {});
    }
  } finally {
    remote.release();
  }

  // A copy of the local database before anything in it is replaced (if that
  // fails, nothing is).
  await backupLocal(what.backupGapMs);

  const client = await local.connect();
  try {
    await client.query('BEGIN');
    // Rows Neon no longer has go first (children first), then adds and changes
    // (parents first).
    for (const spec of [...specs].reverse()) {
      if (spec.keep) continue;
      const theirs = new Set(fetched.get(spec.table)!.rows.map((r) => r.id));
      const mine = await readRows(client, spec, eventId);
      const gone = mine.filter((r) => !theirs.has(r.id)).map((r) => r.key);
      if (gone.length > 0) await deleteKeys(client, spec, gone);
    }
    for (const spec of specs) {
      const { rows, columns } = fetched.get(spec.table)!;
      if (rows.length === 0) continue;
      // The event's judging settings are made on this side; a routine refresh of
      // the setup leaves them be, and only a full sync takes Neon's.
      const skipUpdate = [...(spec.skipUpdate ?? []), ...(spec.table === 'events' && !what.judging ? ['judging_settings'] : [])];
      await upsertRows(client, spec, columns, rows.map((r) => r.json), skipUpdate);
    }
    if (what.judging) {
      // Everything now matches Neon: that is the state to compare against.
      await ensureStateTable(client);
      const names = [...JUDGING_SPECS.map((s) => s.table), SETTINGS_KEY];
      await client.query(`DELETE FROM local_sync_state WHERE table_name = ANY($1::text[])`, [names]);
      for (const spec of JUDGING_SPECS) {
        await client.query(
          `INSERT INTO local_sync_state (table_name, row_id, row_hash, row_key)
           SELECT '${spec.table}', ${pkText(spec)}, md5((${jsonOf(spec)})::text), ${pkJson(spec)} FROM (${spec.scope}) s`,
          paramsFor(spec, eventId)
        );
      }
      await client.query(
        `INSERT INTO local_sync_state (table_name, row_id, row_hash, row_key)
         SELECT $1, id::text, md5(judging_settings::text), '{}'::jsonb FROM events WHERE id = $2`,
        [SETTINGS_KEY, eventId]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  if (what.login) globalForSync.loginPulledAt = Date.now();
  return { structureKey };
}

// ---------------------------------------------------------------------------
// What the rest of the app calls.

// Sends what judging has made since the last push. Returns how many rows went.
export async function pushOnly(): Promise<SyncResult> {
  return exclusive(async () => {
    const eventId = getModeState().localEventId;
    if (!eventId) return record({ kind: 'push', ok: true, message: 'No local event chosen.', pushed: 0 });
    try {
      const pushed = await push(eventId);
      return record({ kind: 'push', ok: true, message: pushed ? `Sent ${pushed} change${pushed === 1 ? '' : 's'} to Neon.` : 'Nothing to send.', pushed });
    } catch (err) {
      return record({ kind: 'push', ok: false, message: message(err) });
    }
  });
}

// Brings the local copy of the event completely up to date: sends what is
// waiting, keeps a backup of the local database, then takes Neon's setup and
// judging rows. Used when the local server takes over from Neon.
export async function fullSync(eventId: string): Promise<SyncResult> {
  return exclusive(async () => {
    try {
      if (getModeState().localEventId === eventId) await push(eventId);
    } catch (err) {
      return record({
        kind: 'full',
        ok: false,
        message: `Could not send the local changes first, so nothing was replaced: ${message(err)}`,
      });
    }
    try {
      const { structureKey } = await pull(eventId, { login: true, judging: true, backupGapMs: 0 });
      updateModeState({ localEventId: eventId, pulledStructureKey: structureKey, lastFullAt: Date.now() });
      return record({ kind: 'full', ok: true, message: 'The local copy is up to date with Neon.' });
    } catch (err) {
      return record({ kind: 'full', ok: false, message: message(err) });
    }
  });
}

// The periodic sync while the local server is in use: send what judging made,
// then refresh the setup if Neon's changed (and the logins now and then).
export async function syncCycle(): Promise<SyncResult> {
  return exclusive(async () => {
    const eventId = getModeState().localEventId;
    if (!eventId) return record({ kind: 'push', ok: true, message: 'No local event chosen.', pushed: 0 });
    let pushed = 0;
    try {
      pushed = await push(eventId);
    } catch (err) {
      return record({ kind: 'push', ok: false, message: message(err) });
    }
    try {
      const remoteKey = await getStructureKey(eventId, getPool('remote'));
      const stale = Date.now() - (globalForSync.loginPulledAt ?? 0) > 10 * 60 * 1000;
      if (remoteKey !== getModeState().pulledStructureKey || stale) {
        const { structureKey } = await pull(eventId, { login: true, judging: false, backupGapMs: 5 * 60 * 1000 });
        updateModeState({ pulledStructureKey: structureKey });
        return record({ kind: 'pull', ok: true, message: 'Updated the event setup from Neon.', pushed });
      }
      return record({ kind: 'push', ok: true, message: pushed ? `Sent ${pushed} change${pushed === 1 ? '' : 's'} to Neon.` : 'Up to date.', pushed });
    } catch (err) {
      return record({ kind: 'pull', ok: false, message: message(err), pushed });
    }
  });
}

