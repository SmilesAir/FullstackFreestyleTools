import 'server-only';
import { pool } from './db';
import { isMissingTable } from './db-errors';
import { SETTINGS } from './settings';
import { getSettings } from './settings-queries';
import { getT } from './i18n/server';
import type { Dictionary } from './i18n/dictionaries';

// The support chat's limits (Settings → Support chat), counted from the Claude
// usage log: one row per question answered (feature 'support-chat', or
// 'judging-trainer' for the Judging Trainer's chat, which shares the limits).

const FEATURES = ['support-chat', 'judging-trainer'];
const KEYS = {
  perUserHour: 'support_chat_per_user_hour',
  perUserDay: 'support_chat_per_user_day',
  allUsersDay: 'support_chat_all_users_day',
  monthlyBudget: 'support_chat_monthly_budget_usd',
} as const;

type Limits = Record<keyof typeof KEYS, number>;

// The saved values, or the defaults Settings shows.
async function readLimits(): Promise<{ limits: Limits; apiKey: boolean }> {
  const saved = await getSettings([...Object.values(KEYS), 'anthropic_api_key']);
  const value = (key: string) => {
    const raw = saved[key] ?? SETTINGS.find((d) => d.key === key)?.default ?? '0';
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const limits = Object.fromEntries(Object.entries(KEYS).map(([name, key]) => [name, value(key)])) as Limits;
  return { limits, apiKey: !!saved.anthropic_api_key };
}

// Whether to show the chat button at all: a key is saved and no limit is 0.
export async function isSupportChatAvailable(): Promise<boolean> {
  try {
    const { limits, apiKey } = await readLimits();
    return apiKey && Object.values(limits).every((n) => n > 0);
  } catch {
    return false;
  }
}

const minutesUntil = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));
const waitText = (t: Dictionary, ms: number) => {
  const minutes = minutesUntil(ms);
  return minutes < 90 ? t.supportChat.aboutMinutes(minutes) : t.supportChat.aboutHours(Math.round(minutes / 60));
};

// null when this person may ask now, else the message to show them. When a
// limit is reached, the wait is until the oldest question in that window ages out.
export async function checkSupportChatLimits(userId: string): Promise<string | null> {
  const { limits, apiKey } = await readLimits();
  const t = await getT();
  const wait = (ms: number) => waitText(t, ms);
  if (!apiKey) return t.supportChat.noKey;
  if (Object.values(limits).some((n) => n === 0)) return t.supportChat.turnedOff;

  let row;
  try {
    const result = await pool.query<{
      user_hour: string;
      user_hour_oldest: number | null;
      user_day: string;
      user_day_oldest: number | null;
      all_day: string;
      all_day_oldest: number | null;
      month_cost: string;
      now_ms: number;
    }>(
      `SELECT
         count(*) FILTER (WHERE user_id = $2 AND created_at > now() - interval '1 hour') AS user_hour,
         extract(epoch FROM min(created_at) FILTER (WHERE user_id = $2 AND created_at > now() - interval '1 hour'))::float8 * 1000 AS user_hour_oldest,
         count(*) FILTER (WHERE user_id = $2 AND created_at > now() - interval '1 day') AS user_day,
         extract(epoch FROM min(created_at) FILTER (WHERE user_id = $2 AND created_at > now() - interval '1 day'))::float8 * 1000 AS user_day_oldest,
         count(*) FILTER (WHERE created_at > now() - interval '1 day') AS all_day,
         extract(epoch FROM min(created_at) FILTER (WHERE created_at > now() - interval '1 day'))::float8 * 1000 AS all_day_oldest,
         COALESCE(sum(cost_usd) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS month_cost,
         extract(epoch FROM now())::float8 * 1000 AS now_ms
       FROM claude_usage
       WHERE feature = ANY($1::text[]) AND created_at >= LEAST(now() - interval '1 day', date_trunc('month', now()))`,
      [FEATURES, userId]
    );
    row = result.rows[0];
  } catch (err) {
    // Without the usage log the limits can't be counted, so the chat stays off.
    if (isMissingTable(err)) return t.supportChat.noTable;
    throw err;
  }

  const left = (oldest: number | null, windowMs: number) => (oldest ?? row.now_ms) + windowMs - row.now_ms;
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  if (Number(row.month_cost) >= limits.monthlyBudget) {
    return t.supportChat.budgetUsed;
  }
  if (Number(row.all_day) >= limits.allUsersDay) {
    return t.supportChat.dayFull(wait(left(row.all_day_oldest, DAY)));
  }
  if (Number(row.user_day) >= limits.perUserDay) {
    return t.supportChat.userDay(limits.perUserDay, wait(left(row.user_day_oldest, DAY)));
  }
  if (Number(row.user_hour) >= limits.perUserHour) {
    return t.supportChat.userHour(limits.perUserHour, wait(left(row.user_hour_oldest, HOUR)));
  }
  return null;
}
