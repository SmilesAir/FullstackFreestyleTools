// Shared (client + server) constants for the Event Creator.

export const DIVISION_NAMES = ['Open Pairs', 'Mixed Pairs', 'Open Co-op', 'Women Pairs'] as const;
export type DivisionName = (typeof DIVISION_NAMES)[number];

export const RULES_IDS = ['Fpa2020', 'SimpleRanking', 'Goe'] as const;
export type RulesId = (typeof RULES_IDS)[number];

// round_number 0 / pool 'roster' = entered but not yet seeded into a round.
export const ROSTER_ROUND = 0;
export const ROSTER_POOL = 'roster';

// Counted back from the Finals.
export const ROUNDS = [
  { number: 1, name: 'Finals' },
  { number: 2, name: 'Semifinals' },
  { number: 3, name: 'Quarterfinals' },
  { number: 4, name: 'Preliminaries' },
] as const;

export const POOL_LETTERS = ['A', 'B', 'C', 'D'] as const;
export const poolId = (letter: string) => `pool${letter}`;

export const ROUTINE_MINUTES = [3, 4, 5] as const;

// Everything defaults to 3 minutes except Open Co-op, which defaults to 4.
export function defaultRoutineSeconds(divisionName: string): number {
  return divisionName === 'Open Co-op' ? 240 : 180;
}

export const JUDGE_CATEGORIES: Record<RulesId, readonly string[]> = {
  Fpa2020: ['Diff', 'Variety', 'ExAi'],
  SimpleRanking: [],
  Goe: ['GoeDiff', 'GoeTech', 'GoeSub'],
};

// A player judging one pool (stored in pool_judges).
export type PoolJudge = { playerId: string; categoryType: string };
export type PoolJudgeView = PoolJudge & { name: string };
export type RoundConfig = { poolCount: number };
export type PoolConfig = { rounds?: Record<string, RoundConfig> };

export function defaultRoundConfig(roundNumber: number): RoundConfig {
  return { poolCount: roundNumber === 1 ? 1 : 2 };
}

export function getRoundConfig(config: PoolConfig, roundNumber: number): RoundConfig {
  return { ...defaultRoundConfig(roundNumber), ...(config.rounds?.[String(roundNumber)] ?? {}) };
}
