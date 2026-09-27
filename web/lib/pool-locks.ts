import 'server-only';
import { pool } from './db';

// A pool (division + round + pool letter, in its stored "poolA" form) is
// locked exactly when its row in `pools` has locked = true; a missing row
// reads as unlocked. Locking freezes that pool's scores, teams and judges,
// enforced wherever those are written (event-creator-actions.ts,
// judging-actions.ts, simple-ranking-actions.ts, head-judge-actions.ts,
// head-judge-routines.ts), not just hidden in the Head Judge's own UI.

export async function isPoolLocked(divisionId: string, roundNumber: number, poolIdValue: string): Promise<boolean> {
  const result = await pool.query<{ locked: boolean }>(
    'SELECT locked FROM pools WHERE division_id = $1 AND round_number = $2 AND pool_id = $3',
    [divisionId, roundNumber, poolIdValue]
  );
  return result.rows[0]?.locked ?? false;
}

// True if any pool of the round is locked: the round-wide team actions
// (re-seeding, clearing) rewrite every pool of the round at once, so they
// refuse on this rather than checking one letter.
export async function isRoundLocked(divisionId: string, roundNumber: number): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM pools WHERE division_id = $1 AND round_number = $2 AND locked LIMIT 1',
    [divisionId, roundNumber]
  );
  return result.rows.length > 0;
}

// Every locked pool of a division, as "round:LETTER" keys (bare letter, not the
// stored "poolA" form), for the Event Creator's UI to grey out.
export async function getLockedPoolKeys(divisionId: string): Promise<string[]> {
  const result = await pool.query<{ round_number: number; pool_id: string }>(
    'SELECT round_number, pool_id FROM pools WHERE division_id = $1 AND locked',
    [divisionId]
  );
  return result.rows.map((r) => `${r.round_number}:${r.pool_id.replace(/^pool/i, '').toUpperCase()}`);
}

// Locks or unlocks a pool. No permission check (the caller adds it, as
// head-judge-actions.ts does for head-judge-routines.ts). Locking is refused
// while a routine is running in this exact pool right now, so a lock never
// leaves a live timer nobody can act on; unlocking always succeeds.
export async function setPoolLockedRow(
  divisionId: string,
  roundNumber: number,
  poolIdValue: string,
  locked: boolean
): Promise<{ error: string | null }> {
  if (locked) {
    const running = await pool.query(
      `SELECT 1 FROM event_play_state s
       WHERE s.division_id = $1 AND s.round_number = $2 AND s.pool_id = $3 AND s.routine_started_at IS NOT NULL`,
      [divisionId, roundNumber, poolIdValue]
    );
    if (running.rows.length > 0) return { error: 'A routine is running in this pool. Finish or cancel it before locking.' };
  }
  await pool.query(
    `INSERT INTO pools (division_id, round_number, pool_id, locked) VALUES ($1, $2, $3, $4)
     ON CONFLICT (division_id, round_number, pool_id) DO UPDATE SET locked = EXCLUDED.locked`,
    [divisionId, roundNumber, poolIdValue, locked]
  );
  return { error: null };
}

export const POOL_LOCKED_ERROR = 'This pool is locked.';
