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

export type RateLimitCheck = { key: string; limit: number; windowSeconds: number };

/**
 * Several fixed windows counted together in ONE statement (a call costs one
 * query however many windows there are). The call is allowed only if every
 * window is within its limit. The result describes the tightest window (the
 * fewest calls left), or, when refused, the one that takes longest to clear.
 */
export async function checkRateLimits(checks: RateLimitCheck[]): Promise<RateLimitResult> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const buckets = checks.map((check) => {
    const windowStart = Math.floor(nowSeconds / check.windowSeconds) * check.windowSeconds;
    return { ...check, bucketKey: `${check.key}:${windowStart}`, reset: windowStart + check.windowSeconds };
  });

  const result = await pool.query<{ bucket_key: string; count: number }>(
    `INSERT INTO api_rate_limits (bucket_key, count, expires_at)
     SELECT k, 1, to_timestamp(e) FROM unnest($1::text[], $2::float8[]) AS t(k, e)
     ON CONFLICT (bucket_key) DO UPDATE SET count = api_rate_limits.count + 1
     RETURNING bucket_key, count`,
    [buckets.map((b) => b.bucketKey), buckets.map((b) => b.reset)]
  );
  const counts = new Map(result.rows.map((r) => [r.bucket_key, r.count]));

  if (Math.random() < 0.01) {
    await pool.query('DELETE FROM api_rate_limits WHERE expires_at < now()');
  }

  const states = buckets.map((b) => {
    const count = counts.get(b.bucketKey) ?? 1;
    return { limit: b.limit, remaining: Math.max(0, b.limit - count), reset: b.reset, over: count > b.limit };
  });
  const refused = states.filter((s) => s.over);
  if (refused.length > 0) {
    const slowest = refused.reduce((a, b) => (b.reset > a.reset ? b : a));
    return { success: false, limit: slowest.limit, remaining: 0, reset: slowest.reset };
  }
  const tightest = states.reduce((a, b) => (b.remaining < a.remaining ? b : a));
  return { success: true, limit: tightest.limit, remaining: tightest.remaining, reset: tightest.reset };
}
