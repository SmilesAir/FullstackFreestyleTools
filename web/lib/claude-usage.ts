import 'server-only';
import { costUsd } from './claude-pricing';
import type { ClaudePromptId } from './claude-prompts';
import { pool } from './db';
import { isMissingTable } from './db-errors';

// A log of every Claude call that was billed (tokens from the API's own usage report,
// cost worked out at the time so a later price change never rewrites history).

type Usage = { input_tokens?: number | null; output_tokens?: number | null };

// Never throws: bookkeeping must not make a parse fail, and an older database (or a
// local one made before this table existed) may not have the table yet.
export async function recordClaudeUsage(entry: {
  feature: ClaudePromptId;
  model: string;
  usage: Usage | undefined;
  stopReason: string | null | undefined;
  userId: string | null;
}): Promise<void> {
  try {
    const input = entry.usage?.input_tokens ?? 0;
    const output = entry.usage?.output_tokens ?? 0;
    await pool.query(
      `INSERT INTO claude_usage (feature, model, input_tokens, output_tokens, cost_usd, stop_reason, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [entry.feature, entry.model, input, output, costUsd(entry.model, input, output), entry.stopReason ?? null, entry.userId]
    );
  } catch (err) {
    if (!isMissingTable(err)) console.error('Could not log the Claude usage', err);
  }
}

export type UsageTotals = { calls: number; inputTokens: number; outputTokens: number; cost: number; unpriced: number };
export type RecentCall = {
  at: string;
  feature: string;
  model: string;
  email: string | null;
  inputTokens: number;
  outputTokens: number;
  cost: number | null;
  stopReason: string | null;
};
export type ClaudeUsage = {
  // False when the table doesn't exist yet on this database.
  available: boolean;
  firstCallAt: string | null;
  month: UsageTotals;
  last30Days: UsageTotals;
  allTime: UsageTotals;
  // Per prompt, each with the same three periods.
  byFeature: Record<string, { month: UsageTotals; allTime: UsageTotals }>;
  recent: RecentCall[];
};

const empty = (): UsageTotals => ({ calls: 0, inputTokens: 0, outputTokens: 0, cost: 0, unpriced: 0 });

export async function getClaudeUsage(): Promise<ClaudeUsage> {
  const none: ClaudeUsage = { available: true, firstCallAt: null, month: empty(), last30Days: empty(), allTime: empty(), byFeature: {}, recent: [] };
  try {
    // One pass: every feature's totals for the calendar month, the last 30 days and ever.
    const sums = await pool.query<{
      feature: string;
      period: 'month' | 'last30' | 'all';
      calls: string;
      input: string;
      output: string;
      cost: string;
      unpriced: string;
    }>(
      `SELECT feature, p.period, count(*) AS calls, sum(input_tokens) AS input, sum(output_tokens) AS output,
              COALESCE(sum(cost_usd), 0) AS cost, count(*) FILTER (WHERE cost_usd IS NULL) AS unpriced
       FROM claude_usage u
       JOIN LATERAL (VALUES
         ('all', true),
         ('last30', u.created_at >= now() - interval '30 days'),
         ('month', u.created_at >= date_trunc('month', now()))
       ) AS p(period, hit) ON p.hit
       GROUP BY feature, p.period`
    );
    const recent = await pool.query<{
      created_at: string;
      feature: string;
      model: string;
      email: string | null;
      input_tokens: number;
      output_tokens: number;
      cost_usd: string | null;
      stop_reason: string | null;
    }>(
      `SELECT u.created_at, u.feature, u.model, us.email, u.input_tokens, u.output_tokens, u.cost_usd, u.stop_reason
       FROM claude_usage u LEFT JOIN users us ON us.id = u.user_id
       ORDER BY u.created_at DESC, u.id DESC LIMIT 20`
    );
    const first = await pool.query<{ first: string | null }>('SELECT min(created_at) AS first FROM claude_usage');

    const result: ClaudeUsage = { ...none, firstCallAt: first.rows[0]?.first ?? null };
    const add = (into: UsageTotals, r: (typeof sums.rows)[number]) => {
      into.calls += Number(r.calls);
      into.inputTokens += Number(r.input);
      into.outputTokens += Number(r.output);
      into.cost += Number(r.cost);
      into.unpriced += Number(r.unpriced);
    };
    for (const r of sums.rows) {
      const target = r.period === 'all' ? result.allTime : r.period === 'month' ? result.month : result.last30Days;
      add(target, r);
      if (r.period !== 'last30') {
        const feature = (result.byFeature[r.feature] ??= { month: empty(), allTime: empty() });
        add(r.period === 'month' ? feature.month : feature.allTime, r);
      }
    }
    result.recent = recent.rows.map((r) => ({
      at: new Date(r.created_at).toISOString(),
      feature: r.feature,
      model: r.model,
      email: r.email,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cost: r.cost_usd === null ? null : Number(r.cost_usd),
      stopReason: r.stop_reason,
    }));
    return result;
  } catch (err) {
    // Settings must still open (the API key lives there) when the log can't be read.
    if (!isMissingTable(err)) console.error('Could not read the Claude usage log', err);
    return { ...none, available: false };
  }
}
