import 'server-only';
import { getSettings } from './settings-queries';

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_DAILY_LIMIT = 500;
const DEFAULT_MONTHLY_LIMIT = 10000;

const positiveInt = (raw: string | null, fallback: number) => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

// The public API's limits, all from one read of the settings: `limit` per
// `windowSeconds` for one IP (a burst), `dailyLimit` per IP per day, and
// `monthlyLimit` for everyone together per 30 days.
export async function getRateLimitConfig(): Promise<{
  limit: number;
  windowSeconds: number;
  dailyLimit: number;
  monthlyLimit: number;
}> {
  const settings = await getSettings([
    'api_rate_limit_requests',
    'api_rate_limit_window_seconds',
    'api_rate_limit_daily_requests',
    'api_rate_limit_monthly_requests',
  ]);
  return {
    limit: positiveInt(settings.api_rate_limit_requests, DEFAULT_LIMIT),
    windowSeconds: positiveInt(settings.api_rate_limit_window_seconds, DEFAULT_WINDOW_SECONDS),
    dailyLimit: positiveInt(settings.api_rate_limit_daily_requests, DEFAULT_DAILY_LIMIT),
    monthlyLimit: positiveInt(settings.api_rate_limit_monthly_requests, DEFAULT_MONTHLY_LIMIT),
  };
}
