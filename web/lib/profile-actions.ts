'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { pool } from './db';
import { isUniqueViolation } from './db-errors';
import { sendDiscordDM } from './discord';

export type ActionState = { error: string | null };

async function currentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  return session.user.id;
}

export async function linkPlayer(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await currentUserId();
  const playerId = String(formData.get('player_id') ?? '').trim();
  if (!playerId) return { error: 'Pick a player to link' };

  try {
    // If the selected player is itself an alias (a duplicate entry), link to
    // its primary entry instead — an alias isn't the canonical record.
    const selected = await pool.query<{ alias_id: string | null }>(
      'SELECT alias_id FROM players WHERE id = $1',
      [playerId]
    );
    const targetId = selected.rows[0]?.alias_id ?? playerId;

    await pool.query('UPDATE users SET player_id = $1 WHERE id = $2', [targetId, userId]);
    return { error: null };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: 'That player is already linked to another account.' };
    return { error: err instanceof Error ? err.message : 'Failed to link player' };
  }
}

export async function unlinkPlayer() {
  const userId = await currentUserId();
  await pool.query('UPDATE users SET player_id = NULL WHERE id = $1', [userId]);
}

const DISCORD_ID_RE = /^\d{15,25}$/;

export async function setDiscordId(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const userId = await currentUserId();
  const raw = String(formData.get('discord_id') ?? '').trim();

  if (raw && !DISCORD_ID_RE.test(raw)) {
    return {
      error:
        'That doesn\'t look like a Discord user ID — it should be a numeric ID (enable Developer Mode in Discord, then right-click your name → Copy User ID).',
    };
  }

  await pool.query('UPDATE users SET discord_id = $1 WHERE id = $2', [raw || null, userId]);
  return { error: null };
}

export async function sendTestDiscordDM(): Promise<ActionState> {
  const userId = await currentUserId();

  const result = await pool.query<{
    discord_id: string | null;
    first_name: string | null;
    last_name: string | null;
    country: string | null;
    membership: number | null;
  }>(
    `SELECT u.discord_id, p.first_name, p.last_name, p.country, p.membership
     FROM users u
     LEFT JOIN players p ON p.id = u.player_id
     WHERE u.id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row?.discord_id) return { error: 'Set your Discord ID first.' };

  const lines = [
    'This is a test message from Fullstack Freestyle Tools — if you got this, Discord notifications are working!',
  ];

  if (row.first_name) {
    lines.push('');
    lines.push('Linked player:');
    lines.push(`${row.first_name} ${row.last_name}`);
    const details = [row.country, row.membership ? `FPA# ${row.membership}` : null].filter(Boolean).join(' · ');
    if (details) lines.push(details);
  } else {
    lines.push('');
    lines.push("(No player linked yet — you can link one on your profile page.)");
  }

  const sent = await sendDiscordDM(row.discord_id, lines.join('\n'));

  return sent.ok ? { error: null } : { error: sent.error };
}
