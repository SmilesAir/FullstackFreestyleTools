import 'server-only';
import type { Pool } from 'pg';
import { getPool, pool } from './db';
import { getMode } from './db-mode';
import { randomCode } from './pool-shortlink';

// An event's unlisted Announcer page ("freestylejudge.com/a/Yx7Kp2Qm"). Like a
// pool's permalink it's a lookup key, not a secret: the page only shows the
// event's pools, who is up and the routine timer, so resolving one needs no
// permission check. Handing one out is the Head Judge's (ensureAnnouncerLink).

// Returns the event's existing code, or generates and stores one; null for an
// unknown event. Events belong to Neon (the local server's sync only pulls them
// down, overwriting its copy), so the code is always made there: on the local
// server it is then copied down too, so it resolves on both and a sync keeps
// it. Throws when Neon can't be reached.
export async function getOrCreateAnnouncerCode(eventId: string): Promise<string | null> {
  const code = await getOrCreateOn(getPool('remote'), eventId);
  if (code && getMode() === 'local') {
    await getPool('local').query('UPDATE events SET announcer_code = $2 WHERE id = $1', [eventId, code]);
  }
  return code;
}

// A fresh code retries on the astronomically unlikely collision.
async function getOrCreateOn(db: Pool, eventId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = await db.query<{ announcer_code: string }>(
        'UPDATE events SET announcer_code = COALESCE(announcer_code, $2) WHERE id = $1 RETURNING announcer_code',
        [eventId, randomCode()]
      );
      return result.rows[0]?.announcer_code ?? null;
    } catch (err) {
      // 23505: another event already has this code — try again.
      if ((err as { code?: string }).code === '23505') continue;
      throw err;
    }
  }
  throw new Error('Could not generate a short code');
}

export type AnnouncerEvent = { eventId: string; eventName: string };

// The event a code points to, or null for an unknown code.
export async function resolveAnnouncerCode(code: string): Promise<AnnouncerEvent | null> {
  const result = await pool.query<{ id: string; event_name: string }>(
    'SELECT id, event_name FROM events WHERE announcer_code = $1',
    [code]
  );
  const row = result.rows[0];
  return row ? { eventId: row.id, eventName: row.event_name } : null;
}
