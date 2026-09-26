import 'server-only';
import { pool } from './db';
import { isMissingTable } from './db-errors';
import type { PointsParams } from './points/params';
import type { RankingRow, RatingRow } from './points/types';

// Published rankings and ratings. A "version" is one date, published as three
// snapshots (ranking-open, ranking-women, rating-open), the way PointsService
// kept them; a snapshot's key is "<type>-<division>_<date>".

export type SnapshotMeta = {
  events: number;
  divisions: number;
  players: number;
  from: string | null;
  to: string | null;
  generatedAt: string;
  params: PointsParams;
};

const SNAPSHOTS = [
  { type: 'ranking', division: 'open' },
  { type: 'ranking', division: 'women' },
  { type: 'rating', division: 'open' },
] as const;

export const DATE_PATTERN = /^\d{4}-\d{1,2}-\d{1,2}$/;

export const snapshotKey = (type: string, division: string, date: string) => `${type}-${division}_${date}`;

export type Version = { date: string; createdAt: number; isHidden: boolean; meta: SnapshotMeta | null; snapshots: number };

// Every published date, newest first.
export async function listVersions(): Promise<Version[]> {
  try {
    return await readVersions();
  } catch (err) {
    // A database made before this table existed: nothing is published there.
    if (isMissingTable(err)) return [];
    throw err;
  }
}

async function readVersions(): Promise<Version[]> {
  const result = await pool.query<{ date: string; created: string; hidden: boolean; meta: SnapshotMeta | null; n: string }>(
    `SELECT date, (extract(epoch FROM max(created_at)) * 1000)::float8 AS created, bool_and(is_hidden) AS hidden,
            (array_agg(meta ORDER BY (type = 'ranking' AND division = 'open') DESC))[1] AS meta, count(*) AS n
     FROM points_snapshots GROUP BY date`
  );
  const versions = result.rows.map((r) => ({ date: r.date, createdAt: Number(r.created), isHidden: r.hidden, meta: r.meta, snapshots: Number(r.n) }));
  return versions.sort((a, b) => b.createdAt - a.createdAt);
}

// Publishes one version: the three snapshots replace any of the same date, and the
// ranking-open / ranking-women rows the Event Creator and /api/v1/rankings read are
// replaced with the same rankings, all in one transaction.
export async function publishVersion(
  date: string,
  data: { open: RankingRow[]; women: RankingRow[]; ratings: RatingRow[] },
  meta: SnapshotMeta
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = [
      { ...SNAPSHOTS[0], data: data.open },
      { ...SNAPSHOTS[1], data: data.women },
      { ...SNAPSHOTS[2], data: data.ratings },
    ];
    for (const row of rows) {
      await client.query(
        `INSERT INTO points_snapshots (key, type, division, date, created_at, is_hidden, data, meta)
         VALUES ($1, $2, $3, $4, now(), false, $5::jsonb, $6::jsonb)
         ON CONFLICT (key) DO UPDATE SET created_at = now(), is_hidden = false, data = EXCLUDED.data, meta = EXCLUDED.meta`,
        [snapshotKey(row.type, row.division, date), row.type, row.division, date, JSON.stringify(row.data), JSON.stringify(meta)]
      );
    }

    // The live rankings (Event Creator seeding, /api/v1/rankings).
    await client.query(`DELETE FROM rankings WHERE category IN ('ranking-open', 'ranking-women')`);
    for (const [category, list] of [['ranking-open', data.open], ['ranking-women', data.women]] as const) {
      const payload = JSON.stringify(list);
      await client.query(
        `INSERT INTO rankings (player_id, category, rank, points, results_count)
         SELECT (x->>'id')::uuid, $1, (x->>'rank')::int, (x->>'points')::numeric, (x->>'resultsCount')::int
         FROM jsonb_array_elements($2::jsonb) x`,
        [category, payload]
      );
      await client.query(
        `INSERT INTO ranking_points (ranking_id, division_id, points)
         SELECT r.id, (pl->>'resultsId')::uuid, (pl->>'points')::numeric
         FROM jsonb_array_elements($2::jsonb) x
         CROSS JOIN LATERAL jsonb_array_elements(x->'pointsList') pl
         JOIN rankings r ON r.player_id = (x->>'id')::uuid AND r.category = $1`,
        [category, payload]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function setVersionHidden(date: string, hidden: boolean): Promise<void> {
  await pool.query('UPDATE points_snapshots SET is_hidden = $2 WHERE date = $1', [date, hidden]);
}

export async function deleteVersion(date: string): Promise<void> {
  await pool.query('DELETE FROM points_snapshots WHERE date = $1', [date]);
}

// ---- What the public API serves ------------------------------------------------------

export async function getManifestBody() {
  const result = await pool.query<{ key: string; type: string; division: string; date: string; created: string; is_hidden: boolean }>(
    `SELECT key, type, division, date, (extract(epoch FROM created_at) * 1000)::float8 AS created, is_hidden FROM points_snapshots`
  );
  const manifest: Record<string, { key: string; date: string; divisionName: string; createdAt: number; dataPath: string; isHidden: boolean }> = {};
  for (const row of result.rows) {
    manifest[row.key] = {
      key: row.key,
      date: row.date,
      divisionName: row.division,
      createdAt: Math.round(Number(row.created)),
      dataPath: `${row.key}.json`,
      isHidden: row.is_hidden,
    };
  }
  return { manifest };
}

export async function getSnapshotBody(key: string) {
  const result = await pool.query<{ data: unknown }>('SELECT data FROM points_snapshots WHERE key = $1', [key]);
  return result.rows.length === 0 ? null : { data: result.rows[0].data };
}

// Every division with played teams: the names the results page shows next to a
// ranking's points, keyed by the same ids the rankings use.
export async function getAllResultsBody() {
  const result = await pool.query<{ id: string; division_name: string; event_id: string; event_name: string; start_date: string }>(
    `SELECT d.id, d.division_name, e.id AS event_id, e.event_name, to_char(e.start_date, 'YYYY-MM-DD') AS start_date
     FROM divisions d JOIN events e ON e.id = d.event_id
     WHERE COALESCE(d.is_hidden, false) = false
       AND EXISTS (SELECT 1 FROM teams t WHERE t.division_id = d.id AND t.round_number >= 1 AND t.place IS NOT NULL)`
  );
  const results: Record<string, { key: string; eventId: string; eventName: string; divisionName: string; startDate: string }> = {};
  for (const row of result.rows) {
    results[row.id] = { key: row.id, eventId: row.event_id, eventName: row.event_name, divisionName: row.division_name, startDate: row.start_date };
  }
  return { results };
}

export async function getAllEventsBody() {
  const result = await pool.query<{ id: string; event_name: string; start_date: string; end_date: string }>(
    `SELECT id, event_name, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date FROM events`
  );
  const allEventSummaryData: Record<string, { key: string; eventName: string; startDate: string; endDate: string }> = {};
  for (const row of result.rows) {
    allEventSummaryData[row.id] = { key: row.id, eventName: row.event_name, startDate: row.start_date, endDate: row.end_date };
  }
  return { allEventSummaryData };
}

// The players who appear in a published (not hidden) ranking or rating.
export async function getAllPlayersBody() {
  const result = await pool.query<{ id: string; first_name: string; last_name: string }>(
    `SELECT p.id, p.first_name, p.last_name FROM players p
     WHERE p.id::text IN (
       SELECT DISTINCT elem->>'id' FROM points_snapshots s, jsonb_array_elements(s.data) elem WHERE NOT s.is_hidden
     )`
  );
  const players: Record<string, { key: string; firstName: string; lastName: string }> = {};
  for (const row of result.rows) players[row.id] = { key: row.id, firstName: row.first_name, lastName: row.last_name };
  return { players };
}
