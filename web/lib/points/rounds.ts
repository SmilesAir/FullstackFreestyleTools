import type { PointsParams } from './params';
import type { ResultsInput } from './types';

// A division's rounds in the order they are read (see RoundOrder in params.ts),
// whatever order they were given in.
export function orderedRounds(results: ResultsInput, params: PointsParams): ResultsInput['rounds'] {
  const rounds = [...results.rounds];
  if (params.roundOrder === 'best-first') return rounds.sort((a, b) => a.round - b.round);
  // Legacy: the Finals, then from the earliest round (highest number) down.
  return rounds.sort((a, b) => (a.round === 1 ? -1 : b.round === 1 ? 1 : b.round - a.round));
}
