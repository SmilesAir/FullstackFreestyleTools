import 'server-only';
import crypto from 'node:crypto';
import { cookies, headers } from 'next/headers';
import type { Pool, PoolClient } from 'pg';
import { getPool, pool } from './db';
import { getMode } from './db-mode';

// The event's judge PIN: two digits the Head Judge reads out, entered once on
// each judging device. Judges don't log in and their links (player ids, seats)
// are public, so the PIN is what keeps a stranger from judging. A device that
// enters it gets a signed cookie holding the PIN it entered; it's good for as
// long as that is still the event's PIN, so a new PIN signs every device out.
// Test events, and events whose Head Judge page hasn't been opened yet (no PIN
// made), need none. Simple Ranking never asks.

// With only 100 PINs, guessing is slowed down exponentially: the first
// FREE_TRIES wrong PINs cost nothing, then each one locks the client out for
// twice as long as the one before (2s, 4s, 8s, ...), up to MAX_LOCK_SECONDS.
const FREE_TRIES = 3;
const MAX_LOCK_SECONDS = 60 * 60;
// Wrong PINs older than this are forgotten.
const FORGET_AFTER = '1 hour';
// How long a remembered device keeps the PIN.
const REMEMBER_SECONDS = 60 * 24 * 60 * 60;

const PIN = /^\d{2}$/;
const cookieName = (eventId: string) => `judge-pin-${eventId}`;
const sign = (payload: string) => crypto.createHmac('sha256', process.env.AUTH_SECRET ?? '').update(payload).digest('base64url');
const randomPin = () => String(crypto.randomInt(100)).padStart(2, '0');

// 42703 / 42P01: the judge_pin column or the attempts table isn't there yet
// (backend/schema.sql not re-run).
const missingColumn = (err: unknown) => ['42703', '42P01'].includes((err as { code?: string }).code ?? '');

// ---- Making the PIN (Head Judge)

// Returns the event's PIN, making one if it has none; null for an unknown event.
// Events belong to Neon (the local server's sync only pulls them down,
// overwriting its copy), so the PIN is always made there and, on the local
// server, copied down too (as with the Announcer link). Throws when Neon can't be
// reached.
export async function getOrCreateJudgePin(eventId: string): Promise<string | null> {
  return writePin(eventId, 'UPDATE events SET judge_pin = COALESCE(judge_pin, $2) WHERE id = $1 RETURNING judge_pin', randomPin());
}

// Replaces the event's PIN with a different one, signs every device out and
// clears the event's wrong-PIN lockouts.
export async function regenerateJudgePin(eventId: string): Promise<string | null> {
  const current = await readPin(getPool('remote'), eventId);
  // Any PIN but the current one.
  const next = current === null ? randomPin() : String((Number(current) + 1 + crypto.randomInt(99)) % 100).padStart(2, '0');
  const pin = await writePin(eventId, 'UPDATE events SET judge_pin = $2 WHERE id = $1 RETURNING judge_pin', next);
  await pool.query('DELETE FROM judge_pin_attempts WHERE event_id = $1', [eventId]);
  return pin;
}

async function writePin(eventId: string, sql: string, pin: string): Promise<string | null> {
  const result = await getPool('remote').query<{ judge_pin: string }>(sql, [eventId, pin]);
  const saved = result.rows[0]?.judge_pin ?? null;
  if (saved && getMode() === 'local') {
    await getPool('local').query('UPDATE events SET judge_pin = $2 WHERE id = $1', [eventId, saved]);
  }
  return saved;
}

async function readPin(db: Pool | PoolClient, eventId: string): Promise<string | null> {
  const result = await db.query<{ judge_pin: string | null }>('SELECT judge_pin FROM events WHERE id = $1', [eventId]);
  return result.rows[0]?.judge_pin ?? null;
}

// The PIN the Head Judge page shows: made if need be, or (when Neon can't be
// reached from the local server) whatever this server already has.
export async function getJudgePinForHeadJudge(eventId: string): Promise<{ pin: string | null; testEvent: boolean; error: string | null }> {
  let testEvent = false;
  try {
    const row = await pool.query<{ is_test: boolean }>('SELECT is_test FROM events WHERE id = $1', [eventId]);
    testEvent = row.rows[0]?.is_test ?? false;
  } catch {
    // Shown as having no PIN below.
  }
  try {
    return { pin: await getOrCreateJudgePin(eventId), testEvent, error: null };
  } catch (err) {
    if (missingColumn(err)) {
      return { pin: null, testEvent, error: 'Run the new lines of backend/schema.sql to turn on judge PINs.' };
    }
    const stored = await readPin(pool, eventId).catch(() => null);
    return { pin: stored, testEvent, error: stored ? null : "Couldn't reach the online database to make a PIN." };
  }
}

// ---- Checking a device (judge screens)

// Whether this device may judge the event: true for a test event, an event with
// no PIN yet, or a device holding the event's current PIN.
export async function judgePinOk(eventId: string): Promise<boolean> {
  let row: { judge_pin: string | null; is_test: boolean } | undefined;
  try {
    const result = await pool.query<{ judge_pin: string | null; is_test: boolean }>(
      'SELECT judge_pin, is_test FROM events WHERE id = $1',
      [eventId]
    );
    row = result.rows[0];
  } catch (err) {
    // Before the schema is updated there are no PINs.
    if (missingColumn(err)) return true;
    throw err;
  }
  if (!row || row.is_test || !row.judge_pin) return true;
  return (await cookiePin(eventId)) === row.judge_pin;
}

// The PIN this device's cookie holds for the event, if the cookie is genuine.
async function cookiePin(eventId: string): Promise<string | null> {
  const raw = (await cookies()).get(cookieName(eventId))?.value;
  if (!raw) return null;
  const [payload, mac] = raw.split('.');
  if (!payload || !mac) return null;
  const expected = sign(payload);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { eventId?: string; pin?: string };
    return value.eventId === eventId && typeof value.pin === 'string' ? value.pin : null;
  } catch {
    return null;
  }
}

async function setPinCookie(eventId: string, pin: string, remember: boolean): Promise<void> {
  const payload = Buffer.from(JSON.stringify({ eventId, pin })).toString('base64url');
  (await cookies()).set(cookieName(eventId), `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // Remembered: kept between browser sessions. Otherwise gone when the browser closes.
    ...(remember ? { maxAge: REMEMBER_SECONDS } : {}),
  });
}

// ---- Entering the PIN

export type PinEntryResult = { ok: true } | { ok: false; error: string; retryAfterMs?: number };

// Who is guessing: a hash of the client's address (Vercel sets x-forwarded-for;
// Next fills it in from the connection on the local server).
async function clientKey(): Promise<string> {
  const list = await headers();
  const ip = list.get('x-forwarded-for')?.split(',')[0].trim() || list.get('x-real-ip')?.trim() || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('base64url').slice(0, 22);
}

// Checks a PIN typed on a judge's device and, if right, remembers it there.
// While the client is locked out the PIN isn't even looked at, so a right guess
// then doesn't help. Guesses from one client are taken one at a time (an
// advisory lock), so firing many at once can't skip the waits.
export async function enterPin(eventId: string, pin: string, remember: boolean): Promise<PinEntryResult> {
  if (!PIN.test(pin)) return { ok: false, error: 'The PIN is 2 digits' };
  const key = await clientKey();
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`judge-pin:${eventId}:${key}`]);
    const event = await db.query<{ judge_pin: string | null; is_test: boolean }>(
      'SELECT judge_pin, is_test FROM events WHERE id = $1',
      [eventId]
    );
    const row = event.rows[0];
    if (!row) {
      await db.query('ROLLBACK');
      return { ok: false, error: 'Unknown event' };
    }
    // Nothing to enter: let the screen through.
    if (row.is_test || !row.judge_pin) {
      await db.query('ROLLBACK');
      return { ok: true };
    }

    const lock = await db.query<{ wait_ms: number }>(
      `SELECT CEIL(EXTRACT(EPOCH FROM (locked_until - now())) * 1000)::int AS wait_ms
       FROM judge_pin_attempts
       WHERE event_id = $1 AND client_key = $2 AND locked_until > now()`,
      [eventId, key]
    );
    if (lock.rows[0]) {
      await db.query('ROLLBACK');
      return { ok: false, error: 'Too many wrong PINs', retryAfterMs: lock.rows[0].wait_ms };
    }

    if (pin === row.judge_pin) {
      await db.query('DELETE FROM judge_pin_attempts WHERE event_id = $1 AND client_key = $2', [eventId, key]);
      await db.query('COMMIT');
      await setPinCookie(eventId, pin, remember);
      return { ok: true };
    }

    // A wrong PIN: count it (starting over after a quiet hour) and lock the
    // client out once the free tries are used up.
    const failures = `CASE WHEN judge_pin_attempts.last_failed_at < now() - interval '${FORGET_AFTER}' THEN 1 ELSE judge_pin_attempts.failures + 1 END`;
    const wrong = await db.query<{ wait_ms: number | null }>(
      `INSERT INTO judge_pin_attempts (event_id, client_key, failures, locked_until, last_failed_at)
       VALUES ($1, $2, 1, NULL, now())
       ON CONFLICT (event_id, client_key) DO UPDATE SET
         failures = ${failures},
         locked_until = CASE WHEN ${failures} > $3
           THEN now() + LEAST(power(2, ${failures} - $3), $4) * interval '1 second'
           ELSE NULL END,
         last_failed_at = now()
       RETURNING CEIL(EXTRACT(EPOCH FROM (locked_until - now())) * 1000)::int AS wait_ms`,
      [eventId, key, FREE_TRIES, MAX_LOCK_SECONDS]
    );
    await db.query('COMMIT');
    const wait = wrong.rows[0]?.wait_ms ?? null;
    return wait && wait > 0
      ? { ok: false, error: 'Wrong PIN', retryAfterMs: wait }
      : { ok: false, error: 'Wrong PIN' };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    if (missingColumn(err)) return { ok: true };
    throw err;
  } finally {
    db.release();
  }
}
