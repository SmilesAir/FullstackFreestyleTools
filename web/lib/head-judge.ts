// Shared (client + server) shapes for the Head Judge tool.
import { ROUNDS } from './event-creator';

// `place` is the recorded final result for this team (NULL until the pool has
// played) - threaded through by getHeadJudgePools for the Event Editor's detail
// panel; Head Judge's own UI uses live derived standings instead and ignores it.
// `timecalls` (seconds left when each time call is made, 0 = "Time") is only
// filled in for the Head Judge's own pools.
export type HeadJudgeTeam = { id: string; players: string[]; place: number | null; timecalls?: number[] };
export type HeadJudgeJudge = { playerId: string; name: string; categoryType: string };

// One pool of one round of one division, with its teams (in play order) and judges.
export type HeadJudgePool = {
  key: string;
  divisionId: string;
  divisionName: string;
  roundNumber: number;
  roundName: string;
  letter: string;
  teams: HeadJudgeTeam[];
  judges: HeadJudgeJudge[];
  // False for rules without judges (Simple Ranking), where having none is normal.
  usesJudges: boolean;
  // How long a routine in this division lasts.
  routineSeconds: number;
  // Frozen by the Head Judge: its scores, teams and judges can't be changed.
  locked: boolean;
  // Visible on this pool's public permalink (see web/lib/public-results.ts).
  resultsPublished: boolean;
};

export type HeadJudgeRound = { number: number; name: string; pools: HeadJudgePool[] };
export type HeadJudgeDivision = { id: string; name: string; rounds: HeadJudgeRound[] };

export const poolKey = (divisionId: string, roundNumber: number, letter: string) =>
  `${divisionId}:${roundNumber}:${letter}`;

export const roundName = (roundNumber: number) =>
  ROUNDS.find((r) => r.number === roundNumber)?.name ?? `Round ${roundNumber}`;

// "Open Pairs · Semifinals · Pool A"
export const poolTitle = (pool: HeadJudgePool) => `${pool.divisionName} · ${pool.roundName} · Pool ${pool.letter}`;

export const teamName = (team: HeadJudgeTeam) => team.players.join(' / ') || '(no players)';

export function flattenPools(divisions: HeadJudgeDivision[]): HeadJudgePool[] {
  return divisions.flatMap((d) => d.rounds.flatMap((r) => r.pools));
}

// Time calls: seconds left in the routine when each is called out (0 = "Time").
// A team that never set any gets DEFAULT_TIMECALLS; the presets always have a
// button, other values only while they are on.
export const DEFAULT_TIMECALLS = [0];
export const PRESET_TIMECALLS = [0, 10, 15, 30];
export const MAX_TIMECALL_SECONDS = 3600;

// "Time", "10 s", "1:30"
export function timecallLabel(seconds: number): string {
  if (seconds === 0) return 'Time';
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// What is said out loud: "Time", "10 seconds", "1 minute", "1 minute 30 seconds".
export function timecallSpeech(seconds: number): string {
  if (seconds === 0) return 'Time';
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes === 0) return plural(rest, 'second');
  return rest === 0 ? plural(minutes, 'minute') : `${plural(minutes, 'minute')} ${plural(rest, 'second')}`;
}

// A list of time calls as saved (no repeats, longest first), or null when a
// value isn't a whole number of seconds in range.
export function cleanTimecalls(seconds: unknown): number[] | null {
  if (!Array.isArray(seconds)) return null;
  if (!seconds.every((s) => Number.isInteger(s) && s >= 0 && s <= MAX_TIMECALL_SECONDS)) return null;
  return [...new Set(seconds as number[])].sort((a, b) => b - a);
}

// "1:30" or "90" as seconds; null when it isn't a time.
export function parseTimecall(text: string): number | null {
  const m = text.trim().match(/^(?:(\d+):([0-5]\d)|(\d+))$/);
  if (!m) return null;
  return m[3] !== undefined ? Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
}
