import 'server-only';
import os from 'node:os';
import { getPool, pool } from './db';
import { getLocalUrl, getMode, getModeState, localConfigured, localUrlSource, type DbMode, type SyncResult } from './db-mode';
import { maskLocalUrl } from './local-url';
import { isSyncing, pendingChanges } from './local-sync';
import { listLocalBackups, type LocalBackup } from './local-backup';
import { CONNECTED_INTERVALS, JUDGE_POLL_MS } from './poll-intervals';

export type Ping = { ok: boolean; ms: number | null; error?: string };

// A timed round trip (SELECT 1) to one database, giving up after `timeoutMs`.
export async function pingDb(kind: DbMode, timeoutMs = 5000): Promise<Ping> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      getPool(kind).query('SELECT 1'),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('No answer')), timeoutMs);
      }),
    ]);
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch (err) {
    return { ok: false, ms: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// Where the judges' phones should point: this computer's private addresses (the
// hotspot's first, virtual adapters last) with the port the server is on.
const HOTSPOT_SUBNETS = ['192.168.137.', '172.20.10.', '192.168.43.'];
const VIRTUAL = /vethernet|wsl|virtualbox|vmware|docker|hyper-v|vpn|tun|tap|loopback|bluetooth/i;
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

export type JudgeUrl = { url: string; name: string; hotspot: boolean };

export function lanUrls(port: string): JudgeUrl[] {
  const found: (JudgeUrl & { virtual: boolean })[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const item of list ?? []) {
      if (item.family !== 'IPv4' || item.internal || !PRIVATE.test(item.address)) continue;
      found.push({
        url: `http://${item.address}:${port}`,
        name,
        hotspot: HOTSPOT_SUBNETS.some((p) => item.address.startsWith(p)),
        virtual: VIRTUAL.test(name),
      });
    }
  }
  found.sort((a, b) => Number(b.hotspot) - Number(a.hotspot) || Number(a.virtual) - Number(b.virtual));
  return found.map(({ url, name, hotspot }) => ({ url, name, hotspot }));
}

export type DbStatus = {
  mode: DbMode;
  configured: boolean;
  // The local database's address with its password hidden, and where it is set
  // (on this page, or in LOCAL_DATABASE_URL). `hosted`: the hosted site, where
  // there is no local database to set.
  localUrl: string | null;
  localUrlSource: 'settings' | 'env' | null;
  hosted: boolean;
  syncing: boolean;
  remote: Ping;
  local: Ping | null;
  localEventId: string | null;
  localEventName: string | null;
  lastFullAt: number | null;
  lastSync: SyncResult | null;
  // Rows waiting to be sent to Neon (null = couldn't be worked out).
  pending: number | null;
  backups: LocalBackup[];
  judgeUrls: JudgeUrl[];
  hostUrl: string;
  // Judges of the playing pool heard from lately (null = no playing pool).
  judges: { connected: number; total: number } | null;
  events: { id: string; name: string }[];
};

async function listEventNames(db: DbMode): Promise<{ id: string; name: string }[]> {
  try {
    const result = await getPool(db).query<{ id: string; event_name: string }>(
      `SELECT id, event_name FROM events ORDER BY start_date DESC, event_name LIMIT 60`
    );
    return result.rows.map((r) => ({ id: r.id, name: r.event_name }));
  } catch {
    return [];
  }
}

export async function getDbStatus({ eventId, port }: { eventId: string | null; port: string }): Promise<DbStatus> {
  const state = getModeState();
  const configured = localConfigured();
  const [remote, local] = await Promise.all([pingDb('remote'), configured ? pingDb('local') : Promise.resolve(null)]);

  const localEventId = state.localEventId;
  const [pending, judges, events, localEventName] = await Promise.all([
    configured && local?.ok && localEventId ? pendingChanges(localEventId).catch(() => null) : Promise.resolve(null),
    readJudges(eventId ?? localEventId),
    listEventNames(remote.ok ? 'remote' : configured && local?.ok ? 'local' : 'remote'),
    localEventId
      ? pool
          .query<{ event_name: string }>(`SELECT event_name FROM events WHERE id = $1`, [localEventId])
          .then((r) => r.rows[0]?.event_name ?? null)
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  return {
    mode: getMode(),
    configured,
    localUrl: maskLocalUrl(getLocalUrl()),
    localUrlSource: localUrlSource(),
    hosted: Boolean(process.env.VERCEL),
    syncing: isSyncing(),
    remote,
    local,
    localEventId,
    localEventName: localEventName ?? events.find((e) => e.id === localEventId)?.name ?? null,
    lastFullAt: state.lastFullAt,
    lastSync: state.lastSync,
    pending,
    backups: listLocalBackups().slice(0, 3),
    judgeUrls: lanUrls(port),
    hostUrl: `http://${os.hostname()}.local:${port}`,
    judges,
    events,
  };
}

async function readJudges(eventId: string | null): Promise<{ connected: number; total: number } | null> {
  if (!eventId) return null;
  try {
    const within = (CONNECTED_INTERVALS * JUDGE_POLL_MS[getMode()]) / 1000;
    const result = await pool.query<{ connected: string; total: string }>(
      `SELECT count(*) FILTER (WHERE pr.seen_at > now() - make_interval(secs => $2)) AS connected, count(*) AS total
       FROM event_play_state s
       JOIN pool_judges pj ON pj.division_id = s.division_id AND pj.round_number = s.round_number AND pj.pool_id = s.pool_id
       LEFT JOIN judge_presence pr ON pr.event_id = s.event_id AND pr.player_id = pj.player_id
       WHERE s.event_id = $1`,
      [eventId, within]
    );
    const row = result.rows[0];
    return row && Number(row.total) > 0 ? { connected: Number(row.connected), total: Number(row.total) } : null;
  } catch {
    return null;
  }
}
