import 'server-only';
import { pool } from './db';

// Whether a pool's results are visible on its public permalink. Missing row
// reads as not published (the default, safe state). Independent of `locked`:
// a pool can be published while still changing, or locked without ever being
// published; both live in the same `pools` row.

// Every published pool of a division, as "round:LETTER" keys (bare letter, not
// the stored "poolA" form), mirroring getLockedPoolKeys in pool-locks.ts.
export async function getPublishedPoolKeys(divisionId: string): Promise<string[]> {
  const result = await pool.query<{ round_number: number; pool_id: string }>(
    'SELECT round_number, pool_id FROM pools WHERE division_id = $1 AND results_published',
    [divisionId]
  );
  return result.rows.map((r) => `${r.round_number}:${r.pool_id.replace(/^pool/i, '').toUpperCase()}`);
}

export async function isPoolResultsPublished(divisionId: string, roundNumber: number, poolIdValue: string): Promise<boolean> {
  const result = await pool.query<{ results_published: boolean }>(
    'SELECT results_published FROM pools WHERE division_id = $1 AND round_number = $2 AND pool_id = $3',
    [divisionId, roundNumber, poolIdValue]
  );
  return result.rows[0]?.results_published ?? false;
}

// No permission check (the caller adds it, as head-judge-actions.ts does).
export async function setPoolResultsPublishedRow(
  divisionId: string,
  roundNumber: number,
  poolIdValue: string,
  published: boolean
): Promise<void> {
  await pool.query(
    `INSERT INTO pools (division_id, round_number, pool_id, results_published) VALUES ($1, $2, $3, $4)
     ON CONFLICT (division_id, round_number, pool_id) DO UPDATE SET results_published = EXCLUDED.results_published`,
    [divisionId, roundNumber, poolIdValue, published]
  );
}
