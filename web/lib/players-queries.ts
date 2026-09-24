import 'server-only';
import { pool } from './db';
import type { PlayerWithAliasName } from './players';

const PAGE_SIZE = 50;

// Matches on substring (ILIKE, catches short/prefix queries reliably) OR
// trigram similarity (catches typos/misspellings), ranked by similarity.
const NAME_MATCH_WHERE = `(
  $1 = ''
  OR p.first_name ILIKE $2 OR p.last_name ILIKE $2
  OR similarity(p.first_name, $1) > 0.3 OR similarity(p.last_name, $1) > 0.3
)`;
const NAME_MATCH_ORDER = `GREATEST(similarity(p.first_name, $1), similarity(p.last_name, $1)) DESC, p.last_name, p.first_name`;

export async function listPlayers(q: string, page: number) {
  const offset = (Math.max(page, 1) - 1) * PAGE_SIZE;
  const term = `%${q}%`;

  const [rows, count] = await Promise.all([
    pool.query<PlayerWithAliasName>(
      `SELECT p.*, a.first_name AS alias_first_name, a.last_name AS alias_last_name
       FROM players p
       LEFT JOIN players a ON a.id = p.alias_id
       WHERE ${NAME_MATCH_WHERE}
       ORDER BY ${NAME_MATCH_ORDER}
       LIMIT $3 OFFSET $4`,
      [q, term, PAGE_SIZE, offset]
    ),
    pool.query<{ count: string }>(
      `SELECT count(*) FROM players p WHERE ${NAME_MATCH_WHERE}`,
      [q, term]
    ),
  ]);

  return {
    players: rows.rows,
    total: Number(count.rows[0].count),
    pageSize: PAGE_SIZE,
  };
}

export async function getPlayer(id: string): Promise<PlayerWithAliasName | null> {
  const result = await pool.query<PlayerWithAliasName>(
    `SELECT p.*, a.first_name AS alias_first_name, a.last_name AS alias_last_name
     FROM players p
     LEFT JOIN players a ON a.id = p.alias_id
     WHERE p.id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}
