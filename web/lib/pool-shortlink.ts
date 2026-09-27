import 'server-only';
import crypto from 'node:crypto';
import { pool } from './db';

// A pool's public permalink is a short code ("freestylejudge.com/r/Yx7Kp2Qm"),
// not its ids: shorter, and it doesn't let anyone guess another pool's link
// from it. It's a lookup key, not a secret — the results themselves stay
// gated by `results_published` (pool-publish.ts) — so creating or resolving
// one needs no permission check.

// Skips characters that are easy to confuse in a shared link: 0/O, 1/I/l.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 8;

function randomCode(): string {
  let out = '';
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

// Returns the pool's existing code, or generates and stores one. A pool
// already having a code (the common case) is one query; a fresh one retries
// a few times on the astronomically unlikely collision.
export async function getOrCreateShortCode(divisionId: string, roundNumber: number, poolIdValue: string): Promise<string> {
  const existing = await pool.query<{ short_code: string | null }>(
    'SELECT short_code FROM pools WHERE division_id = $1 AND round_number = $2 AND pool_id = $3',
    [divisionId, roundNumber, poolIdValue]
  );
  if (existing.rows[0]?.short_code) return existing.rows[0].short_code;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await pool.query(
        `INSERT INTO pools (division_id, round_number, pool_id, short_code) VALUES ($1, $2, $3, $4)
         ON CONFLICT (division_id, round_number, pool_id) DO UPDATE SET short_code = COALESCE(pools.short_code, EXCLUDED.short_code)`,
        [divisionId, roundNumber, poolIdValue, code]
      );
    } catch (err) {
      // 23505: another pool already has this code (or two requests raced) — try again.
      if ((err as { code?: string }).code === '23505') continue;
      throw err;
    }
    const saved = await pool.query<{ short_code: string }>(
      'SELECT short_code FROM pools WHERE division_id = $1 AND round_number = $2 AND pool_id = $3',
      [divisionId, roundNumber, poolIdValue]
    );
    if (saved.rows[0]?.short_code) return saved.rows[0].short_code;
  }
  throw new Error('Could not generate a short code');
}

export type ResolvedPool = { eventId: string; divisionId: string; roundNumber: number; poolId: string };

// The pool a code points to, or null for an unknown code.
export async function resolveShortCode(code: string): Promise<ResolvedPool | null> {
  const result = await pool.query<{ event_id: string; division_id: string; round_number: number; pool_id: string }>(
    `SELECT d.event_id, p.division_id, p.round_number, p.pool_id
     FROM pools p JOIN divisions d ON d.id = p.division_id
     WHERE p.short_code = $1`,
    [code]
  );
  const row = result.rows[0];
  return row ? { eventId: row.event_id, divisionId: row.division_id, roundNumber: row.round_number, poolId: row.pool_id } : null;
}
