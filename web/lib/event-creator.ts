// Shared (client + server) constants for the Event Creator.

export const DIVISION_NAMES = ['Open Pairs', 'Mixed Pairs', 'Open Co-op', 'Women Pairs'] as const;
export type DivisionName = (typeof DIVISION_NAMES)[number];

// Every judging system a division can be on (older divisions may still use
// ones that are no longer offered).
export const RULES_IDS = ['Fpa2027', 'SimpleRanking', 'Fpa2020', 'Goe'] as const;
export type RulesId = (typeof RULES_IDS)[number];
// The ones the Rules dropdown offers, in its order.
export const OFFERED_RULES_IDS: readonly RulesId[] = ['Fpa2027', 'SimpleRanking'];
// The rules a new division starts with.
export const DEFAULT_NEW_RULES_ID: RulesId = 'Fpa2027';

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
  Fpa2020: ['Diff', 'AI', 'Ex'],
  Fpa2027: ['Diff', 'AI', 'Ex'],
  SimpleRanking: [],
  Goe: ['GoeDiff', 'GoeTech', 'GoeSub'],
};

// Column headings for the stored category values.
export const JUDGE_CATEGORY_LABELS: Record<string, string> = {
  Diff: 'Diff',
  AI: 'AI',
  Ex: 'Ex',
  GoeDiff: 'Diff',
  GoeTech: 'Tech',
  GoeSub: 'Sub',
};

// A player judging one pool (stored in pool_judges).
export type PoolJudge = { playerId: string; categoryType: string };

// How much a player has judged: pools in this event (any category), and pools
// per category across every event. Counts come from pool_judges, so they cover
// judging assigned in this tool.
export type JudgeStats = { eventCount: number; counts: Record<string, number> };

export type PoolJudgeView = PoolJudge & JudgeStats & { name: string };

export type JudgeCandidate = JudgeStats & {
  id: string;
  name: string;
  country: string | null;
  // Open ranking points.
  points: number;
  // Pool letter they compete in for this round, when it isn't the pool being set.
  playingIn: string | null;
};

// "event-cat1-cat2-cat3", e.g. 3-12-4-9: pools judged in this event, then the
// lifetime count for each of the rules' categories.
export function formatJudgeCount(stats: JudgeStats, categories: readonly string[]): string {
  return [stats.eventCount, ...categories.map((c) => stats.counts[c] ?? 0)].join('-');
}
export type RoundConfig = { poolCount: number };
export type PoolConfig = { rounds?: Record<string, RoundConfig> };

export function defaultRoundConfig(roundNumber: number): RoundConfig {
  return { poolCount: roundNumber === 1 ? 1 : 2 };
}

export function getRoundConfig(config: PoolConfig, roundNumber: number): RoundConfig {
  return { ...defaultRoundConfig(roundNumber), ...(config.rounds?.[String(roundNumber)] ?? {}) };
}
