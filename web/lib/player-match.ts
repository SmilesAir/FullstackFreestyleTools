import 'server-only';
import { pool } from './db';
import type { Candidate, ParsedSlot } from './player-match-types';

const MATCH_THRESHOLD = 0.6;
const CANDIDATE_FLOOR = 0.3;
const AMBIGUITY_GAP = 0.08;

// Fuzzy-match one written name against real (non-hidden) players, trying both
// "First Last" and "Last First" orderings. Aliases resolve to their primary.
export async function matchName(input: string): Promise<ParsedSlot> {
  const result = await pool.query<{
    id: string;
    first_name: string;
    last_name: string;
    country: string | null;
    membership: number | null;
    score: number;
  }>(
    `SELECT COALESCE(a.id, p.id) AS id,
            COALESCE(a.first_name, p.first_name) AS first_name,
            COALESCE(a.last_name, p.last_name) AS last_name,
            COALESCE(a.country, p.country) AS country,
            COALESCE(a.membership, p.membership) AS membership,
            GREATEST(
              similarity(p.first_name || ' ' || p.last_name, $1),
              similarity(p.last_name || ' ' || p.first_name, $1)
            ) AS score
     FROM players p
     LEFT JOIN players a ON a.id = p.alias_id
     WHERE p.hidden = false
       AND GREATEST(
             similarity(p.first_name || ' ' || p.last_name, $1),
             similarity(p.last_name || ' ' || p.first_name, $1)
           ) >= $2
     ORDER BY score DESC
     LIMIT 8`,
    [input, CANDIDATE_FLOOR]
  );

  // An alias and its primary can both show up — keep the best score per player.
  const seen = new Map<string, Candidate>();
  for (const r of result.rows) {
    if (!seen.has(r.id)) {
      seen.set(r.id, {
        id: r.id,
        name: `${r.first_name} ${r.last_name}`,
        country: r.country,
        membership: r.membership,
        score: Number(r.score),
      });
    }
  }
  const candidates = [...seen.values()].slice(0, 5);
  if (candidates.length === 0) return { input, status: 'none', candidates: [], selectedId: null };

  const [top, second] = candidates;
  const confident = top.score >= MATCH_THRESHOLD && (!second || top.score - second.score >= AMBIGUITY_GAP);
  return confident
    ? { input, status: 'matched', candidates, selectedId: top.id }
    : { input, status: 'uncertain', candidates, selectedId: null };
}

const CONCURRENCY = 6;

// Matches every distinct written name, a few at a time (a long roster is a lot of queries).
export async function matchAll(names: string[]): Promise<Map<string, ParsedSlot>> {
  const unique = [...new Set(names)];
  const out = new Map<string, ParsedSlot>();
  for (let i = 0; i < unique.length; i += CONCURRENCY) {
    const slots = await Promise.all(unique.slice(i, i + CONCURRENCY).map(matchName));
    slots.forEach((slot, j) => out.set(unique[i + j], slot));
  }
  return out;
}

// Splits "First Last" at the final space (the rest is the first name).
export async function insertPlayerByName(
  fullName: string
): Promise<{ error: string | null; player?: { id: string; name: string } }> {
  const trimmed = fullName.trim().replace(/\s+/g, ' ');
  const idx = trimmed.lastIndexOf(' ');
  if (idx < 1) return { error: 'Need a first and last name to create a player' };
  const first = trimmed.slice(0, idx);
  const last = trimmed.slice(idx + 1);

  const result = await pool.query<{ id: string }>(
    `INSERT INTO players (id, first_name, last_name, created_at, last_active, hidden)
     VALUES (gen_random_uuid(), $1, $2, now(), now(), false) RETURNING id`,
    [first, last]
  );
  return { error: null, player: { id: result.rows[0].id, name: `${first} ${last}` } };
}
