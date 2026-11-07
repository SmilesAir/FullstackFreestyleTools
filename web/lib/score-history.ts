import 'server-only';
import type { Pool } from 'pg';

// Every write to fpa2027_judge_scores goes through writeScore, which adds the
// values just written to fpa2027_judge_score_history in the same statement, so
// no score can change without a version being kept.

type Queryable = Pick<Pool, 'query'>;

export type ScoreSource = 'judge' | 'backup' | 'adjust_start' | 'settings';

export type ScoreChange = {
  source: ScoreSource;
  // The signed-in Head Judge who made the change (null for judges, who don't sign in).
  userId?: string | null;
  // The judge's device address (judges only).
  clientIp?: string | null;
  // The same submit saving again (a note arrived while it saved): the version
  // it just recorded is corrected rather than a second one added.
  amendLast?: boolean;
};

const HISTORY_COLUMNS =
  'routine_id, judge_player_id, category_type, baseline_estimate, adjust_percent, score, settings';

// Whether the history table exists, so scores still save on a database the
// schema hasn't been applied to yet (looked up again until it is there). A
// failed query can't be used for this: inside a transaction it aborts the rest.
let historyTableSeen = false;
async function hasHistoryTable(db: Queryable): Promise<boolean> {
  if (historyTableSeen) return true;
  const found = await db.query<{ ok: boolean }>(
    `SELECT to_regclass('fpa2027_judge_score_history') IS NOT NULL AS ok`
  );
  historyTableSeen = found.rows[0]?.ok ?? false;
  if (!historyTableSeen) console.error('fpa2027_judge_score_history is missing: run the schema. Scores save without history.');
  return historyTableSeen;
}

// Runs `write` (an INSERT or UPDATE of fpa2027_judge_scores, without RETURNING)
// with `params`, and records each row it wrote as a new version. A write that
// matches no row records nothing.
export async function writeScore(db: Queryable, write: string, params: unknown[], change: ScoreChange): Promise<void> {
  if (!(await hasHistoryTable(db))) {
    await db.query(write, params);
    return;
  }
  const n = params.length;
  if (change.amendLast) {
    await db.query(
      `WITH s AS (${write} RETURNING ${HISTORY_COLUMNS})
       UPDATE fpa2027_judge_score_history h
       SET baseline_estimate = s.baseline_estimate, adjust_percent = s.adjust_percent,
           score = s.score, settings = s.settings
       FROM s
       WHERE h.id = (SELECT l.id FROM fpa2027_judge_score_history l
                     WHERE l.routine_id = s.routine_id AND l.judge_player_id = s.judge_player_id
                       AND l.category_type = s.category_type
                     ORDER BY l.changed_at DESC, l.id DESC LIMIT 1)`,
      params
    );
    return;
  }
  await db.query(
    `WITH s AS (${write} RETURNING ${HISTORY_COLUMNS})
     INSERT INTO fpa2027_judge_score_history (${HISTORY_COLUMNS}, source, changed_by_user, client_ip)
     SELECT ${HISTORY_COLUMNS}, $${n + 1}::text, $${n + 2}::uuid, $${n + 3}::text FROM s`,
    [...params, change.source, change.userId ?? null, change.clientIp ?? null]
  );
}

// One version of a score, oldest first, for the Head Judge's history view.
export type ScoreVersion = {
  changedAt: number;
  source: ScoreSource;
  changedBy: string | null;
  score: number;
  baseline: number;
  adjustPercent: number;
};

export async function getScoreHistory(
  db: Queryable,
  routineId: string,
  playerId: string,
  categoryType: string
): Promise<ScoreVersion[]> {
  if (!(await hasHistoryTable(db))) return [];
  const result = await db.query<{
    changed_ms: number;
    source: ScoreSource;
    changed_by: string | null;
    score: string;
    baseline_estimate: string;
    adjust_percent: string;
  }>(
    `SELECT extract(epoch FROM h.changed_at)::float8 * 1000 AS changed_ms, h.source,
            COALESCE(NULLIF(trim(p.first_name || ' ' || p.last_name), ''), u.discord_username, u.email) AS changed_by,
            h.score, h.baseline_estimate, h.adjust_percent
     FROM fpa2027_judge_score_history h
     LEFT JOIN users u ON u.id = h.changed_by_user
     LEFT JOIN players p ON p.id = u.player_id
     WHERE h.routine_id = $1 AND h.judge_player_id = $2 AND h.category_type = $3
     ORDER BY h.changed_at, h.id`,
    [routineId, playerId, categoryType]
  );
  return result.rows.map((r) => ({
    changedAt: Math.round(r.changed_ms),
    source: r.source,
    changedBy: r.changed_by,
    score: Number(r.score),
    baseline: Number(r.baseline_estimate),
    adjustPercent: Number(r.adjust_percent),
  }));
}

// How many times the judge saved each score of these routines (their own
// changes; rescoring by the Head Judge isn't counted), by
// "routineId:playerId:category". More than one means the judge changed it.
export async function judgeVersionCounts(db: Queryable, routineIds: string[]): Promise<Map<string, number>> {
  if (routineIds.length === 0 || !(await hasHistoryTable(db))) return new Map();
  const result = await db.query<{ routine_id: string; judge_player_id: string; category_type: string; versions: number }>(
    `SELECT routine_id, judge_player_id, category_type, count(*)::int AS versions
     FROM fpa2027_judge_score_history
     WHERE routine_id = ANY($1::uuid[]) AND source IN ('judge', 'backup')
     GROUP BY 1, 2, 3`,
    [routineIds]
  );
  return new Map(result.rows.map((r) => [`${r.routine_id}:${r.judge_player_id}:${r.category_type}`, r.versions]));
}
