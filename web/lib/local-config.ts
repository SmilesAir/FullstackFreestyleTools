import 'server-only';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { getLocalUrl, getMode, getModeState, updateModeState } from './db-mode';
import { validateLocalUrl } from './local-url';

export type ConfigResult = { ok: boolean; message: string; hasTables?: boolean };

const connect = async (url: string) => {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 4000 });
  await client.connect();
  return client;
};

const problem = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Whether a connection string reaches a database (and has the app's tables).
export async function testLocalUrl(url: string): Promise<ConfigResult> {
  const invalid = validateLocalUrl(url);
  if (invalid) return { ok: false, message: invalid };
  let client: Client | null = null;
  try {
    client = await connect(url);
    const found = await client.query<{ present: boolean }>(`SELECT to_regclass('events') IS NOT NULL AS present`);
    const hasTables = found.rows[0]?.present === true;
    return {
      ok: true,
      hasTables,
      message: hasTables ? 'Connected. The tables are there.' : 'Connected, but the tables are not there yet: use Set up tables.',
    };
  } catch (err) {
    return { ok: false, message: `Could not connect: ${problem(err)}` };
  } finally {
    await client?.end().catch(() => {});
  }
}

// Changing the address while the local server is in use would cut it away from
// under the judges.
const busy = (): ConfigResult | null =>
  getMode() === 'local' ? { ok: false, message: 'Switch to Postgres before changing the local database.' } : null;

export async function saveLocalUrl(url: string): Promise<ConfigResult> {
  const stopped = busy();
  if (stopped) return stopped;
  const tested = await testLocalUrl(url);
  if (!tested.ok) return tested;
  // A different database has none of the earlier downloads.
  if (url.trim() !== getLocalUrl()) updateModeState({ localUrl: url.trim(), lastFullAt: null, pulledStructureKey: '', lastSync: null });
  return { ok: true, hasTables: tested.hasTables, message: `Saved. ${tested.message}` };
}

// Forgets the saved address (the LOCAL_DATABASE_URL environment variable, if any, applies again).
export function clearLocalUrl(): ConfigResult {
  const stopped = busy();
  if (stopped) return stopped;
  if (getModeState().localUrl) updateModeState({ localUrl: null, lastFullAt: null, pulledStructureKey: '', lastSync: null });
  return { ok: true, message: 'Removed the saved address.' };
}

// backend/schema.sql, or null when it can't be found next to the web folder.
function readSchema(): string | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), '..', 'backend', 'schema.sql'), 'utf8');
  } catch {
    return null;
  }
}

const NO_SCHEMA: ConfigResult = {
  ok: false,
  message: "Couldn't find backend/schema.sql next to the web folder. Run npm run local:setup instead.",
};

// Creates the app's tables in the local database (backend/schema.sql; safe to repeat).
export async function setUpLocalTables(): Promise<ConfigResult> {
  const stopped = busy();
  if (stopped) return stopped;
  const url = getLocalUrl();
  if (!url) return { ok: false, message: 'Set the local database address first.' };
  const schema = readSchema();
  if (schema === null) return NO_SCHEMA;
  let client: Client | null = null;
  try {
    client = await connect(url);
    await client.query(schema);
    return { ok: true, hasTables: true, message: 'The tables are set up.' };
  } catch (err) {
    return { ok: false, message: `Could not set up the tables: ${problem(err)}` };
  } finally {
    await client?.end().catch(() => {});
  }
}

export type CreateOptions = {
  adminPassword: string;
  adminUser: string;
  host: string;
  port: number;
  database: string;
  appUser: string;
};

const NAME = /^[a-z_][a-z0-9_]{0,62}$/;
const ADMIN_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const HOST = /^[A-Za-z0-9.-]{1,253}$/;

// A statement built by the server itself from quoted parts (%I identifiers, %L
// literals), so no name or password is ever pasted into SQL text here.
async function quoted(client: Client, template: string, ...values: string[]): Promise<string> {
  const result = await client.query<{ s: string }>(`SELECT format($1::text, ${values.map((_, i) => `$${i + 2}::text`).join(', ')}) AS s`, [
    template,
    ...values,
  ]);
  return result.rows[0].s;
}

// From an installed Postgres to a working, saved address: makes a dedicated login
// for the app (so the saved address never holds the admin password), a database
// it owns, the two extensions the schema needs, and the tables, then saves the
// address. The admin password is used only here, in memory. Every step can be
// repeated, so a failure is fixed and run again with nothing to clean up.
export async function createLocalDatabase(o: CreateOptions): Promise<ConfigResult> {
  const stopped = busy();
  if (stopped) return stopped;
  if (process.env.VERCEL) return { ok: false, message: 'This is the hosted site: do this on the laptop that runs the local server.' };
  if (!NAME.test(o.database)) return { ok: false, message: 'The database name may use lowercase letters, digits and _ (starting with a letter or _).' };
  if (!NAME.test(o.appUser)) return { ok: false, message: 'The app login name may use lowercase letters, digits and _ (starting with a letter or _).' };
  if (!ADMIN_NAME.test(o.adminUser)) return { ok: false, message: 'The admin user name has characters that are not allowed.' };
  if (!Number.isInteger(o.port) || o.port < 1 || o.port > 65535) return { ok: false, message: 'The port must be a number from 1 to 65535.' };
  if (!HOST.test(o.host)) return { ok: false, message: 'The host has characters that are not allowed.' };
  if (!o.adminPassword) return { ok: false, message: 'Enter the Postgres admin password (the one chosen when Postgres was installed).' };
  const invalid = validateLocalUrl(`postgresql://${o.appUser}@${o.host}:${o.port}/${o.database}`);
  if (invalid) return { ok: false, message: invalid };
  // Checked before anything is created.
  const schema = readSchema();
  if (schema === null) return NO_SCHEMA;

  const admin = (database: string) =>
    new Client({ host: o.host, port: o.port, user: o.adminUser, password: o.adminPassword, database, connectionTimeoutMillis: 4000 });
  const password = randomBytes(18).toString('base64url');
  const notes: string[] = [];
  const first = admin('postgres');
  const inside = admin(o.database);
  let app: Client | null = null;
  let firstOpen = false;
  let insideOpen = false;
  try {
    try {
      await first.connect();
      firstOpen = true;
    } catch (err) {
      return { ok: false, message: `Could not connect to Postgres at ${o.host}:${o.port} as ${o.adminUser}: ${problem(err)}` };
    }

    // The login: no superuser, cannot make databases or other logins.
    const role = await first.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [o.appUser]);
    await first.query(
      await quoted(first, `${role.rowCount ? 'ALTER' : 'CREATE'} ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L`, o.appUser, password)
    );
    notes.push(role.rowCount ? `the login ${o.appUser} already existed (its password was reset)` : `created the login ${o.appUser}`);

    // The database, owned by that login.
    const existing = await first.query<{ owner: string }>(
      `SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname = $1`,
      [o.database]
    );
    if (existing.rowCount === 0) {
      await first.query(await quoted(first, 'CREATE DATABASE %I OWNER %I', o.database, o.appUser));
      notes.push(`created the database ${o.database}`);
    } else if (existing.rows[0].owner !== o.appUser) {
      await first.query(await quoted(first, 'ALTER DATABASE %I OWNER TO %I', o.database, o.appUser));
      notes.push(`the database ${o.database} already existed (now owned by ${o.appUser})`);
    } else {
      notes.push(`the database ${o.database} already existed`);
    }

    // Inside it, as the admin: the two extensions the schema needs, and the login takes over
    // any tables an earlier setup made under another owner (so it can change them).
    await inside.connect();
    insideOpen = true;
    await inside.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await inside.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    const foreign = await inside.query<{ kind: string; q: string }>(
      `SELECT 'TABLE' AS kind, quote_ident(schemaname) || '.' || quote_ident(tablename) AS q FROM pg_tables WHERE schemaname = 'public' AND tableowner <> $1
       UNION ALL
       SELECT 'VIEW', quote_ident(schemaname) || '.' || quote_ident(viewname) FROM pg_views WHERE schemaname = 'public' AND viewowner <> $1`,
      [o.appUser]
    );
    for (const item of foreign.rows) {
      await inside.query(await quoted(inside, `ALTER ${item.kind} %s OWNER TO %I`, item.q, o.appUser));
    }
    if (foreign.rowCount) notes.push(`${o.appUser} took over ${foreign.rowCount} existing table${foreign.rowCount === 1 ? '' : 's'}`);

    // The tables, as the new login, so it owns them.
    const url = `postgresql://${encodeURIComponent(o.appUser)}:${encodeURIComponent(password)}@${o.host}:${o.port}/${o.database}`;
    app = await connect(url);
    await app.query(schema);

    const saved = await saveLocalUrl(url);
    if (!saved.ok) return saved;
    return { ok: true, hasTables: true, message: `Done: ${notes.join('; ')}; the tables are set up and the address is saved.` };
  } catch (err) {
    return { ok: false, message: `Could not create the database (${notes.join('; ') || 'nothing was made yet'}): ${problem(err)}` };
  } finally {
    await Promise.all([
      firstOpen ? first.end().catch(() => {}) : undefined,
      insideOpen ? inside.end().catch(() => {}) : undefined,
      app?.end().catch(() => {}),
    ]);
  }
}
