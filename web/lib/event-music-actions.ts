'use server';

import { requirePermission } from './authz';
import { setTeamTimecallsChecked } from './team-timecalls';
import { isMusicRound, parseMusicLink } from './team-music-links';
import { cleanMusicFileUrl, getTeamKey, getTeamMusic, saveTeamMusic, type TeamKey } from './team-music';
import type { MusicActionResult } from './player-music-actions';

// Sets a team's time calls from the Event Music screen, like the Head Judge's
// Play tab. Refused while the team's pool is locked.
export async function setMusicTeamTimecalls(teamId: string, seconds: number[]): Promise<{ error: string | null }> {
  await requirePermission('event_music');
  return setTeamTimecallsChecked(teamId, seconds);
}

// Any team, any round: unlike a player's own (checkMyTeam), the music computer
// can still fix a song once a pool is finished or locked.
async function anyTeam(teamId: string, round: number): Promise<{ error: string } | { error: null; team: TeamKey }> {
  await requirePermission('event_music');
  if (!isMusicRound(round)) return { error: 'Unknown round' };
  const team = await getTeamKey(teamId);
  if (!team) return { error: 'Unknown team' };
  return { error: null, team };
}

// Saves an MP3 the browser just uploaded (app/api/team-music/upload) as the
// round's file, replacing any earlier one.
export async function setEventTeamMusicFile(
  teamId: string,
  round: number,
  url: string,
  fileName: string
): Promise<MusicActionResult> {
  const found = await anyTeam(teamId, round);
  if (found.error !== null) return { error: found.error };
  const fileUrl = cleanMusicFileUrl(url, found.team.divisionId);
  if (!fileUrl) return { error: 'Bad file address' };
  const name = fileName.trim().slice(0, 200) || 'music.mp3';

  await saveTeamMusic(found.team, round, { fileUrl, fileName: name });
  return { error: null, music: await getTeamMusic(found.team) };
}

// Saves a YouTube or Spotify link as the round's link.
export async function setEventTeamMusicLink(teamId: string, round: number, link: string): Promise<MusicActionResult> {
  const found = await anyTeam(teamId, round);
  if (found.error !== null) return { error: found.error };
  const parsed = parseMusicLink(link);
  if (!parsed) return { error: 'Paste a YouTube video or Spotify track link.' };

  await saveTeamMusic(found.team, round, { link: parsed.link });
  return { error: null, music: await getTeamMusic(found.team) };
}

// Removes the round's file or link.
export async function clearEventTeamMusic(teamId: string, round: number, which: 'file' | 'link'): Promise<MusicActionResult> {
  const found = await anyTeam(teamId, round);
  if (found.error !== null) return { error: found.error };

  await saveTeamMusic(found.team, round, which === 'file' ? { fileUrl: null, fileName: null } : { link: null });
  return { error: null, music: await getTeamMusic(found.team) };
}
