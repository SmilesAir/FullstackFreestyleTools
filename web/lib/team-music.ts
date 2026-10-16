import 'server-only';
import { del } from '@vercel/blob';
import { pool } from './db';
import { teamMusicPathPrefix, type TeamMusic, type TeamMusicByRound } from './team-music-links';

export { teamMusicPathPrefix } from './team-music-links';

// A team's music (team_music in schema.sql), by division and sorted player ids
// (checkMyTeam in team-timecalls.ts gives both).
export type TeamKey = { divisionId: string; playerIds: string[] };

export async function getTeamMusic(team: TeamKey): Promise<TeamMusicByRound> {
  const result = await pool.query<{ round_number: number; file_url: string | null; file_name: string | null; link: string | null }>(
    `SELECT round_number, file_url, file_name, link FROM team_music WHERE division_id = $1 AND player_ids = $2::uuid[]`,
    [team.divisionId, team.playerIds]
  );
  return Object.fromEntries(
    result.rows.map((r) => [r.round_number, { fileUrl: r.file_url, fileName: r.file_name, link: r.link }])
  );
}

// Changes one round's music: the given fields replace the stored ones, and a
// round left with neither a file nor a link is removed. A file no longer used
// by any team is deleted from storage.
export async function saveTeamMusic(team: TeamKey, round: number, changes: Partial<TeamMusic>): Promise<void> {
  const before = (await getTeamMusic(team))[round] ?? { fileUrl: null, fileName: null, link: null };
  const after: TeamMusic = { ...before, ...changes };
  if (!after.fileUrl) after.fileName = null;

  if (!after.fileUrl && !after.link) {
    await pool.query(
      `DELETE FROM team_music WHERE division_id = $1 AND player_ids = $2::uuid[] AND round_number = $3`,
      [team.divisionId, team.playerIds, round]
    );
  } else {
    await pool.query(
      `INSERT INTO team_music (division_id, player_ids, round_number, file_url, file_name, link, updated_at)
       VALUES ($1, $2::uuid[], $3, $4, $5, $6, now())
       ON CONFLICT (division_id, player_ids, round_number)
       DO UPDATE SET file_url = EXCLUDED.file_url, file_name = EXCLUDED.file_name, link = EXCLUDED.link, updated_at = now()`,
      [team.divisionId, team.playerIds, round, after.fileUrl, after.fileName, after.link]
    );
  }

  if (before.fileUrl && before.fileUrl !== after.fileUrl) await deleteIfUnused(before.fileUrl);
}

// A team row's music key: its division and sorted player ids; null for an
// unknown team or one without players.
export async function getTeamKey(teamId: string): Promise<TeamKey | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId)) return null;
  const result = await pool.query<{ division_id: string; player_ids: string[] | null }>(
    `SELECT t.division_id,
            (SELECT array_agg(tp.player_id ORDER BY tp.player_id) FROM team_players tp WHERE tp.team_id = t.id) AS player_ids
     FROM teams t WHERE t.id = $1`,
    [teamId]
  );
  const row = result.rows[0];
  return row?.player_ids ? { divisionId: row.division_id, playerIds: row.player_ids } : null;
}

// The address to save for an MP3 the browser uploaded for this division
// (without the query string), or null when it isn't one of ours.
export function cleanMusicFileUrl(url: string, divisionId: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname.endsWith('.blob.vercel-storage.com') ||
    !parsed.pathname.startsWith(`/${teamMusicPathPrefix(divisionId)}`)
  ) {
    return null;
  }
  return `${parsed.origin}${parsed.pathname}`;
}

export async function isTeamMusicFile(url: string): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM team_music WHERE file_url = $1 LIMIT 1`, [url]);
  return (result.rowCount ?? 0) > 0;
}

async function deleteIfUnused(url: string): Promise<void> {
  if (await isTeamMusicFile(url)) return;
  try {
    await del(url);
  } catch (err) {
    // A leftover file only costs storage; the change itself is saved.
    console.error('Could not delete old team music file', err);
  }
}
