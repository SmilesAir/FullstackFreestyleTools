import 'server-only';
import { pool } from './db';

export type ProfileData = {
  email: string;
  discordId: string | null;
  player: { id: string; first_name: string; last_name: string } | null;
};

export async function getProfileData(userId: string): Promise<ProfileData> {
  const result = await pool.query<{
    email: string;
    discord_id: string | null;
    player_id: string | null;
    player_first_name: string | null;
    player_last_name: string | null;
  }>(
    `SELECT u.email, u.discord_id, p.id AS player_id, p.first_name AS player_first_name, p.last_name AS player_last_name
     FROM users u
     LEFT JOIN players p ON p.id = u.player_id
     WHERE u.id = $1`,
    [userId]
  );

  const row = result.rows[0];
  return {
    email: row.email,
    discordId: row.discord_id,
    player: row.player_id
      ? { id: row.player_id, first_name: row.player_first_name!, last_name: row.player_last_name! }
      : null,
  };
}
