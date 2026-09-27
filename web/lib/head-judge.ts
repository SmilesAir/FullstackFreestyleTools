// Shared (client + server) shapes for the Head Judge tool.
import { ROUNDS } from './event-creator';

export type HeadJudgeTeam = { id: string; players: string[] };
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
