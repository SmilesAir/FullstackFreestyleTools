import 'server-only';
import { after } from 'next/server';
import { getPool } from './db';
import { getMode, getModeState } from './db-mode';
import { isSyncing } from './local-sync';

// On the local server, the Head Judge's play state reaches Neon with the next
// sync (every LOCAL_SYNC_INTERVAL_SECONDS), so a screen on another network (the
// Event Music tool or the Announcer on the Vercel site) would learn who is up,
// and when their routine started, that late. This sends who is up (the playing
// pool and team) and the routine's start time to Neon as soon as they change,
// after the Head Judge's action has answered. The routine row itself may not
// be on Neon yet, so its id is only sent once Neon has it (the sync sends the
// whole row later anyway). A send that fails changes nothing but the wait.

const globalForRelay = globalThis as unknown as { playRelay?: { running: boolean; again: boolean } };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Call after a change of the playing pool or team, or a routine starting or
// stopping, has been saved.
export function relayPlayState(eventId: string) {
  if (getMode() !== 'local' || getModeState().localEventId !== eventId) return;
  after(() => run(eventId));
}

// One send at a time; a change made meanwhile is sent once it is done (the
// newest row is read each time, so changes in between are never sent stale).
async function run(eventId: string) {
  const state = (globalForRelay.playRelay ??= { running: false, again: false });
  if (state.running) {
    state.again = true;
    return;
  }
  state.running = true;
  try {
    do {
      state.again = false;
      const syncing = isSyncing();
      try {
        await send(eventId);
      } catch {
        // Neon unreachable: the next sync sends it.
      }
      // A sync that read the row before this change could still write the old
      // one over it: send again once that sync is done.
      if (syncing || isSyncing()) {
        await waitForSync();
        state.again = true;
      }
    } while (state.again);
  } finally {
    state.running = false;
  }
}

async function waitForSync() {
  for (let waited = 0; isSyncing() && waited < 60_000; waited += 500) await sleep(500);
}

async function send(eventId: string) {
  const local = await getPool('local').query<{
    division_id: string | null;
    round_number: number | null;
    pool_id: string | null;
    team_id: string | null;
    routine_started_at: string | null;
    routine_id: string | null;
    judges_ready_at: string | null;
    updated_at: string;
  }>(
    // Times as text: a JS Date would drop their microseconds, and updated_at is compared below.
    `SELECT division_id, round_number, pool_id, team_id, routine_started_at::text, routine_id,
            judges_ready_at::text, updated_at::text
     FROM event_play_state WHERE event_id = $1`,
    [eventId]
  );
  const row = local.rows[0];
  if (!row) return;
  // Never replaces a newer row (sent by the sync, or by an earlier send that
  // finished later).
  // The routine id only when Neon already has that routine (else NULL, which
  // the next sync replaces, its row having changed since it last sent it).
  await getPool('remote').query(
    `INSERT INTO event_play_state (event_id, division_id, round_number, pool_id, team_id, routine_started_at, routine_id, judges_ready_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, (SELECT id FROM routines WHERE id = $7::uuid), $9::timestamptz, $8::timestamptz)
     ON CONFLICT (event_id) DO UPDATE
     SET division_id = EXCLUDED.division_id, round_number = EXCLUDED.round_number, pool_id = EXCLUDED.pool_id,
         team_id = EXCLUDED.team_id, routine_started_at = EXCLUDED.routine_started_at,
         routine_id = EXCLUDED.routine_id, judges_ready_at = EXCLUDED.judges_ready_at,
         updated_at = EXCLUDED.updated_at
     WHERE event_play_state.updated_at <= EXCLUDED.updated_at`,
    [eventId, row.division_id, row.round_number, row.pool_id, row.team_id, row.routine_started_at, row.routine_id, row.updated_at, row.judges_ready_at]
  );
}
