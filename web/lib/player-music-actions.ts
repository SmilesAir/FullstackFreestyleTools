'use server';

import { auth } from '@/auth';
import { ROUNDS } from './event-creator';
import { ALL_ROUNDS, parseMusicLink, type TeamMusicByRound } from './team-music-links';
import { getTeamMusic, saveTeamMusic, teamMusicPathPrefix, type TeamKey } from './team-music';
import { checkMyTeam } from './team-timecalls';

export type MusicActionResult = { error: string; music?: undefined } | { error: null; music: TeamMusicByRound };

const isRound = (round: number) => round === ALL_ROUNDS || ROUNDS.some((r) => r.number === round);

// A player's own team, for a round (ALL_ROUNDS or one of ROUNDS) they can still
// set music for (see checkMyTeam).
async function myTeam(teamId: string, round: number): Promise<{ error: string } | { error: null; team: TeamKey }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Sign in to set music.' };
  if (!Number.isInteger(round) || !isRound(round)) return { error: 'Unknown round' };
  const check = await checkMyTeam(teamId, session.user.id, round);
  if (check.error !== null) return { error: check.error };
  return { error: null, team: { divisionId: check.divisionId, playerIds: check.playerIds } };
}

// Saves an MP3 the browser just uploaded (app/api/team-music/upload) as the
// round's file, replacing any earlier one.
export async function setMyTeamMusicFile(
  teamId: string,
  round: number,
  url: string,
  fileName: string
): Promise<MusicActionResult> {
  const found = await myTeam(teamId, round);
  if (found.error !== null) return { error: found.error };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'Bad file address' };
  }
  if (
    parsed.protocol !== 'https:' ||
    !parsed.hostname.endsWith('.blob.vercel-storage.com') ||
    !parsed.pathname.startsWith(`/${teamMusicPathPrefix(found.team.divisionId)}`)
  ) {
    return { error: 'Bad file address' };
  }
  const name = fileName.trim().slice(0, 200) || 'music.mp3';

  await saveTeamMusic(found.team, round, { fileUrl: `${parsed.origin}${parsed.pathname}`, fileName: name });
  return { error: null, music: await getTeamMusic(found.team) };
}

// Saves a YouTube or Spotify link as the round's link.
export async function setMyTeamMusicLink(teamId: string, round: number, link: string): Promise<MusicActionResult> {
  const found = await myTeam(teamId, round);
  if (found.error !== null) return { error: found.error };
  const parsed = parseMusicLink(link);
  if (!parsed) return { error: 'Paste a YouTube video or Spotify track link.' };

  await saveTeamMusic(found.team, round, { link: parsed.link });
  return { error: null, music: await getTeamMusic(found.team) };
}

// Removes the round's file or link.
export async function clearMyTeamMusic(teamId: string, round: number, which: 'file' | 'link'): Promise<MusicActionResult> {
  const found = await myTeam(teamId, round);
  if (found.error !== null) return { error: found.error };

  await saveTeamMusic(found.team, round, which === 'file' ? { fileUrl: null, fileName: null } : { link: null });
  return { error: null, music: await getTeamMusic(found.team) };
}
