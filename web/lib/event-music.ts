import type { PollMode } from './poll-intervals';
import type { TeamMusic, TeamMusicByRound } from './team-music-links';

// Shared (client + server) shapes for the Event Music tool.

// Each team row's song for its pool's round (its own round's, else All
// rounds'), by team id; null = no song.
export type TeamSongs = Record<string, TeamMusic | null>;

// Each team row's music for every round (shared by the rows of the same
// players), by team id; a team without any has no entry.
export type TeamMusicMap = Record<string, TeamMusicByRound>;

// What the Event Music page polls: who is up on the Head Judge's screen, when
// their routine started (server clock, ms; null = not running) with the
// server's clock when it was read, and fingerprints of the event's structure (its pools, teams and their time calls)
// and of its team music. When either fingerprint changes the page reads its
// data again.
export type EventMusicPoll = {
  divisionId: string | null;
  roundNumber: number | null;
  poolLetter: string | null;
  teamId: string | null;
  routineStartedAt: number | null;
  serverNow: number;
  structureKey: string;
  musicKey: string;
  mode: PollMode;
};

export const songKind = (music: TeamMusic): string => {
  if (music.fileUrl) return 'MP3';
  if (music.link?.includes('spotify.com')) return 'Spotify';
  return 'YouTube';
};

// "MP3 · song.mp3", "YouTube", "Spotify"
export const songLabel = (music: TeamMusic): string =>
  music.fileUrl ? `MP3 · ${music.fileName ?? 'file'}` : songKind(music);
