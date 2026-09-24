import 'server-only';
import { pool } from './db';

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix seconds when the current window resets. */
  reset: number;
};

/**
 * Fixed-window counter backed by Postgres. `key` should already identify the
 * caller + endpoint (e.g. `${ip}:rankings`); the window itself gets folded
 * into the stored bucket key so a single upsert does the counting.
 *
 * This is the only place that knows the storage is Postgres — swapping to
 * Upstash/Redis later means rewriting this function's body, not its callers.
 */
export async function checkRateLimit(
  key: string,
  opts: { limit: number; windowSeconds: number }
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = opts;
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const reset = windowStart + windowSeconds;
  const bucketKey = `${key}:${windowStart}`;

  const result = await pool.query<{ count: number }>(
    `INSERT INTO api_rate_limits (bucket_key, count, expires_at)
     VALUES ($1, 1, to_timestamp($2))
     ON CONFLICT (bucket_key) DO UPDATE SET count = api_rate_limits.count + 1
     RETURNING count`,
    [bucketKey, reset]
  );
  const count = result.rows[0].count;

  // Bound table growth without a cron job — cheap, and correctness doesn't
  // depend on this ever running (an unlucky moment just delays cleanup).
  if (Math.random() < 0.01) {
    await pool.query('DELETE FROM api_rate_limits WHERE expires_at < now()');
  }

  return {
    success: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    reset,
  };
}
