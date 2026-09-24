import 'server-only';
import { pool } from './db';

const PAGE_SIZE = 50;

export type RankingRow = {
  rank: number | null;
  points: string | null;
  results_count: number | null;
  player_id: string;
  first_name: string;
  last_name: string;
  country: string | null;
  membership: number | null;
};

export async function listRankings(opts: { category: string; page: number; country?: string }) {
  const { category, page, country } = opts;
  const offset = (Math.max(page, 1) - 1) * PAGE_SIZE;
  const countryFilter = country ? country : null;

  const where = `r.category = $1 AND p.hidden = false AND ($2::text IS NULL OR p.country = $2)`;

  const [rows, count] = await Promise.all([
    pool.query<RankingRow>(
      `SELECT r.rank, r.points, r.results_count,
              p.id AS player_id, p.first_name, p.last_name, p.country, p.membership
       FROM rankings r
       JOIN players p ON p.id = r.player_id
       WHERE ${where}
       ORDER BY r.rank NULLS LAST, p.last_name, p.first_name
       LIMIT $3 OFFSET $4`,
      [category, countryFilter, PAGE_SIZE, offset]
    ),
    pool.query<{ count: string }>(
      `SELECT count(*) FROM rankings r JOIN players p ON p.id = r.player_id WHERE ${where}`,
      [category, countryFilter]
    ),
  ]);

  const total = Number(count.rows[0].count);

  return {
    results: rows.rows,
    page: Math.max(page, 1),
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
