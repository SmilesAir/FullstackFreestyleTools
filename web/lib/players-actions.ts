'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { pool } from './db';
import { normalizeGender } from './players';
import { listPlayers } from './players-queries';

export async function searchPlayersList(q: string, page: number) {
  return listPlayers(q, page);
}

export type ActionState = { error: string | null };

const playerSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required'),
  last_name: z.string().trim().min(1, 'Last name is required'),
  gender: z.string().optional(),
  country: z.string().optional(),
  fpa_website_id: z.string().optional(),
  membership: z.string().optional(),
  alias_id: z.string().optional(),
});

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

type ParsedPlayerData = {
  first_name: string;
  last_name: string;
  gender: string | null;
  country: string | null;
  fpa_website_id: string | null;
  membership: number | null;
  alias_id: string | null;
};

type ParseResult = { error: string } | { data: ParsedPlayerData };

function parseFormData(formData: FormData): ParseResult {
  const parsed = playerSchema.safeParse({
    first_name: formData.get('first_name'),
    last_name: formData.get('last_name'),
    gender: formData.get('gender') ?? undefined,
    country: formData.get('country') ?? undefined,
    fpa_website_id: formData.get('fpa_website_id') ?? undefined,
    membership: formData.get('membership') ?? undefined,
    alias_id: formData.get('alias_id') ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message } as const;
  }

  const membershipRaw = blankToNull(parsed.data.membership);
  const membership = membershipRaw === null ? null : Number(membershipRaw);
  if (membership !== null && !Number.isFinite(membership)) {
    return { error: 'Membership must be a number' } as const;
  }

  return {
    data: {
      first_name: parsed.data.first_name,
      last_name: parsed.data.last_name,
      gender: normalizeGender(formData.get('gender')),
      country: blankToNull(parsed.data.country),
      fpa_website_id: blankToNull(parsed.data.fpa_website_id),
      membership,
      alias_id: blankToNull(parsed.data.alias_id),
    },
  } as const;
}

export async function createPlayer(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseFormData(formData);
  if (!('data' in parsed)) return { error: parsed.error };

  const { first_name, last_name, gender, country, fpa_website_id, membership, alias_id } = parsed.data;
  const now = new Date().toISOString();

  let newId: string;
  try {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO players
         (id, first_name, last_name, alias_id, gender, country, fpa_website_id, membership, created_at, last_active, hidden)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $8, false)
       RETURNING id`,
      [first_name, last_name, alias_id, gender, country, fpa_website_id, membership, now]
    );
    newId = result.rows[0].id;
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to create player' };
  }

  redirect(`/players/${newId}`);
}

export async function updatePlayer(id: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseFormData(formData);
  if (!('data' in parsed)) return { error: parsed.error };

  const { first_name, last_name, gender, country, fpa_website_id, membership, alias_id } = parsed.data;

  if (alias_id === id) {
    return { error: 'A player cannot be their own alias' };
  }

  try {
    await pool.query(
      `UPDATE players
       SET first_name = $1, last_name = $2, alias_id = $3, gender = $4,
           country = $5, fpa_website_id = $6, membership = $7
       WHERE id = $8`,
      [first_name, last_name, alias_id, gender, country, fpa_website_id, membership, id]
    );
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Failed to update player' };
  }

  redirect(`/players/${id}`);
}

export async function hidePlayer(id: string) {
  await pool.query('UPDATE players SET hidden = true WHERE id = $1', [id]);
  redirect(`/players/${id}`);
}

export async function unhidePlayer(id: string) {
  await pool.query('UPDATE players SET hidden = false WHERE id = $1', [id]);
  redirect(`/players/${id}`);
}

export async function searchPlayersForPicker(q: string, excludeId?: string) {
  if (q.trim().length < 2) return [];
  const result = await pool.query<{
    id: string;
    first_name: string;
    last_name: string;
    country: string | null;
    membership: number | null;
    alias_id: string | null;
  }>(
    `SELECT id, first_name, last_name, country, membership, alias_id FROM players
     WHERE hidden = false
       AND id IS DISTINCT FROM $2
       AND (
         first_name ILIKE $1 OR last_name ILIKE $1
         OR similarity(first_name, $3) > 0.3 OR similarity(last_name, $3) > 0.3
       )
     ORDER BY GREATEST(similarity(first_name, $3), similarity(last_name, $3)) DESC, last_name, first_name
     LIMIT 10`,
    [`%${q}%`, excludeId ?? null, q]
  );
  return result.rows;
}
