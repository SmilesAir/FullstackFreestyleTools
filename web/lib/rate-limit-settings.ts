import 'server-only';
import { getSetting } from './settings-queries';

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_SECONDS = 60;

export async function getRateLimitConfig(): Promise<{ limit: number; windowSeconds: number }> {
  const [limitRaw, windowRaw] = await Promise.all([
    getSetting('api_rate_limit_requests'),
    getSetting('api_rate_limit_window_seconds'),
  ]);

  const limit = Number(limitRaw);
  const windowSeconds = Number(windowRaw);

  return {
    limit: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
    windowSeconds: Number.isInteger(windowSeconds) && windowSeconds > 0 ? windowSeconds : DEFAULT_WINDOW_SECONDS,
  };
}
