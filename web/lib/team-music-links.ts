import { ROUNDS } from './event-creator';

// Team music (team_music in schema.sql) shared by the browser and the server.

// round_number 0: the song for every round without one of its own.
export const ALL_ROUNDS = 0;

// ALL_ROUNDS or one of ROUNDS.
export const isMusicRound = (round: number) =>
  Number.isInteger(round) && (round === ALL_ROUNDS || ROUNDS.some((r) => r.number === round));

export const MAX_MUSIC_BYTES = 15 * 1024 * 1024;

export type TeamMusic = {
  fileUrl: string | null;
  fileName: string | null;
  link: string | null;
};

// Per round number (ALL_ROUNDS included); a round without an entry uses ALL_ROUNDS'.
export type TeamMusicByRound = Record<number, TeamMusic>;

export const musicForRound = (byRound: TeamMusicByRound, round: number): TeamMusic | null =>
  byRound[round] ?? byRound[ALL_ROUNDS] ?? null;

export const musicRoundName = (round: number) =>
  round === ALL_ROUNDS ? 'All rounds' : (ROUNDS.find((r) => r.number === round)?.name ?? `Round ${round}`);

// A team's music files go under team-music/<division id>/, so a saved URL
// can be checked to be one of ours for that division.
export const teamMusicPathPrefix = (divisionId: string) => `team-music/${divisionId}/`;

// Where the browser plays an uploaded file from (the blob is private).
export const musicFileSrc = (fileUrl: string) => `/api/team-music/file?u=${encodeURIComponent(fileUrl)}`;

export type MusicLink = { kind: 'youtube' | 'spotify'; id: string; link: string; embedUrl: string };

// A YouTube or Spotify track link, in standard form, with its embeddable
// player; null for anything else.
export function parseMusicLink(text: string): MusicLink | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^(www|m)\./, '');

  let youtubeId: string | null = null;
  if (host === 'youtu.be') youtubeId = url.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'music.youtube.com') {
    youtubeId = url.pathname === '/watch' ? url.searchParams.get('v') : (url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null);
  }
  if (youtubeId !== null) {
    if (!/^[\w-]{11}$/.test(youtubeId)) return null;
    return {
      kind: 'youtube',
      id: youtubeId,
      link: `https://www.youtube.com/watch?v=${youtubeId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
    };
  }

  if (host === 'open.spotify.com') {
    const id = url.pathname.match(/^\/(?:intl-[\w-]+\/)?track\/([A-Za-z0-9]{22})\/?$/)?.[1];
    if (!id) return null;
    return {
      kind: 'spotify',
      id,
      link: `https://open.spotify.com/track/${id}`,
      embedUrl: `https://open.spotify.com/embed/track/${id}`,
    };
  }
  return null;
}
