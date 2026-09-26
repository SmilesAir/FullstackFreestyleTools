import 'server-only';
import { checkRateLimits } from './rate-limit';
import { getRateLimitConfig } from './rate-limit-settings';
import { getClientIp } from './request-ip';

// What every public GET endpoint shares: CORS (the results pages are served from
// another site), the rate limits, JSON errors that never carry a stack trace, and
// cache headers so most page views are answered by the CDN without reaching the
// function or the database.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const DAY = 24 * 60 * 60;
const MONTH = 30 * DAY;

// Published data changes only when someone publishes, so a copy may be kept for
// 10 minutes by the CDN (and a minute by the browser).
const CACHE = 'public, max-age=60, s-maxage=600, stale-while-revalidate=3600';

const rateHeaders = (rl: { limit: number; remaining: number; reset: number }) => ({
  'X-RateLimit-Limit': String(rl.limit),
  'X-RateLimit-Remaining': String(rl.remaining),
  'X-RateLimit-Reset': String(rl.reset),
});

export const preflight = () => new Response(null, { status: 204, headers: CORS });

// Counts this call against the burst (per IP, per window), daily (per IP) and
// monthly (everyone) limits in one query. `ok` is false when refused, and then
// `response` is the 429 to send.
export async function applyRateLimit(
  request: Request,
  name: string
): Promise<{ ok: true; headers: Record<string, string> } | { ok: false; response: Response }> {
  const ip = getClientIp(request);
  const config = await getRateLimitConfig();
  const rl = await checkRateLimits([
    { key: `${ip}:${name}`, limit: config.limit, windowSeconds: config.windowSeconds },
    { key: `${ip}:${name}:day`, limit: config.dailyLimit, windowSeconds: DAY },
    { key: `all:${name}:month`, limit: config.monthlyLimit, windowSeconds: MONTH },
  ]);
  const headers = { ...CORS, ...rateHeaders(rl) };
  if (rl.success) return { ok: true, headers };
  return {
    ok: false,
    response: Response.json(
      { error: 'Too many requests. Slow down and try again shortly.' },
      {
        status: 429,
        headers: { ...headers, 'Retry-After': String(Math.max(1, rl.reset - Math.floor(Date.now() / 1000))), 'Cache-Control': 'no-store' },
      }
    ),
  };
}

// A public GET handler for the points API: `load` returns the JSON body (or a
// Response, for a 404 and the like).
export function publicGet<P = Record<string, never>>(name: string, load: (request: Request, params: P) => Promise<unknown>) {
  return async (request: Request, context?: { params: Promise<P> }): Promise<Response> => {
    try {
      const limited = await applyRateLimit(request, name);
      if (!limited.ok) return limited.response;
      const params = (context ? await context.params : {}) as P;
      const body = await load(request, params);
      if (body instanceof Response) return body;
      return Response.json(body, { headers: { ...limited.headers, 'Cache-Control': CACHE } });
    } catch {
      // The database being unreachable or a bug: say so in JSON, with CORS so a browser shows it.
      return Response.json({ error: 'Something went wrong. Try again in a moment.' }, { status: 500, headers: { ...CORS, 'Cache-Control': 'no-store' } });
    }
  };
}

export const notFound = (message: string) =>
  Response.json({ error: message }, { status: 404, headers: { ...CORS, 'Cache-Control': 'public, max-age=60' } });
