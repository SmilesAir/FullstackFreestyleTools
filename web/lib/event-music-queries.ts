import 'server-only';
import { pool } from './db';
import { getMode } from './db-mode';
import { activeEventSql } from './active-events-queries';
import { flattenPools, type HeadJudgeDivision } from './head-judge';
import { getPlayState } from './head-judge-queries';
import { musicForRound } from './team-music-links';
import type { EventMusicPoll, TeamMusicMap, TeamSongs } from './event-music';

export type PlayingEvent = { id: string; name: string; isTest: boolean };

// Events turned on as playing (hidden ones left out), newest first.
export async function listPlayingEvents(): Promise<PlayingEvent[]> {
  const result = await pool.query<{ id: string; event_name: string; is_test: boolean }>(
    `SELECT e.id, e.event_name, e.is_test FROM events e
     WHERE ${activeEventSql('e')}
     ORDER BY e.start_date DESC, e.event_name`
  );
  return result.rows.map((r) => ({ id: r.id, name: r.event_name, isTest: r.is_test }));
}

// The music of every team in the event's pools, and the song each plays in
// its pool. Music belongs to a team's players in a division (team_music), so
// every team row of the same players shares it, each using its own round's
// song or else All rounds'.
export async function getTeamSongs(
  eventId: string,
  divisions: HeadJudgeDivision[]
): Promise<{ songs: TeamSongs; music: TeamMusicMap }> {
  const result = await pool.query<{
    team_id: string;
    round_number: number;
    file_url: string | null;
    file_name: string | null;
    link: string | null;
  }>(
    `WITH t AS (
       SELECT t.id, t.division_id,
              (SELECT array_agg(tp.player_id ORDER BY tp.player_id) FROM team_players tp WHERE tp.team_id = t.id) AS player_ids
       FROM teams t JOIN divisions d ON d.id = t.division_id
       WHERE d.event_id = $1
     )
     SELECT t.id AS team_id, tm.round_number, tm.file_url, tm.file_name, tm.link
     FROM t JOIN team_music tm ON tm.division_id = t.division_id AND tm.player_ids = t.player_ids`,
    [eventId]
  );
  const music: TeamMusicMap = {};
  for (const r of result.rows) {
    (music[r.team_id] ??= {})[r.round_number] = { fileUrl: r.file_url, fileName: r.file_name, link: r.link };
  }

  const songs: TeamSongs = {};
  for (const p of flattenPools(divisions)) {
    for (const team of p.teams) songs[team.id] = musicForRound(music[team.id] ?? {}, p.roundNumber);
  }
  return { songs, music };
}

// A fingerprint of the event's team music, so the page notices a song saved
// or changed elsewhere (a player's My teams).
export async function getMusicKey(eventId: string): Promise<string> {
  const result = await pool.query<{ key: string }>(
    `SELECT md5(COALESCE(string_agg(md5(to_jsonb(tm)::text), ',' ORDER BY tm.division_id, tm.player_ids, tm.round_number), '')) AS key
     FROM team_music tm JOIN divisions d ON d.id = tm.division_id
     WHERE d.event_id = $1`,
    [eventId]
  );
  return result.rows[0]?.key ?? '';
}

export async function getEventMusicPoll(eventId: string): Promise<EventMusicPoll> {
  const [play, musicKey] = await Promise.all([getPlayState(eventId), getMusicKey(eventId)]);
  return {
    divisionId: play.state.divisionId,
    roundNumber: play.state.roundNumber,
    poolLetter: play.state.poolLetter,
    teamId: play.state.teamId,
    routineStartedAt: play.state.routineStartedAt,
    serverNow: play.serverNow,
    structureKey: play.structureKey,
    musicKey,
    mode: getMode(),
  };
}
