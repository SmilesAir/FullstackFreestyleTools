// Pure helpers for arranging teams inside a round's pools (no DB, shared by the
// client component and the server action).
import { POOL_LETTERS, poolId } from './event-creator';

export type PoolTeam = {
  id: string;
  pool_id: string;
  // Result once the pool has played; NULL until then.
  place: number | null;
  // Order the team plays within its pool; NULL until someone arranges the pool.
  play_order: number | null;
  points: number;
  players: { name: string }[];
};

// pool letter -> teams in play order
export type Layout<T> = Record<string, T[]>;

// A team is identified by who is on it, not by its row: the same team appears
// as a separate row in every round it plays.
export function teamKey(playerIds: string[]): string {
  return [...playerIds].sort().join('|');
}

// Puts `team` into pool `letter` at gap `index` (0 = first, length = last).
export function insertPoolTeam<T>(layout: Layout<T>, team: T, letter: string, index: number): Layout<T> {
  if (!layout[letter]) return layout;
  const target = layout[letter].slice();
  target.splice(Math.min(Math.max(index, 0), target.length), 0, team);
  return { ...layout, [letter]: target };
}

const firstName = (t: PoolTeam) => t.players[0]?.name ?? '';

// Top to bottom is the order teams play, so the last team to play is at the
// bottom. Teams with a play order come first, in that order. Anything not yet
// ordered follows, weakest first and strongest last (the strongest team plays
// last): worst place first, or lowest ranking first when there's no place.
export function sortPoolTeams<T extends PoolTeam>(teams: T[]): T[] {
  return [...teams].sort((a, b) => {
    if (a.play_order !== null && b.play_order !== null) return a.play_order - b.play_order;
    if (a.play_order !== null) return -1;
    if (b.play_order !== null) return 1;
    if (a.place !== b.place) return (b.place ?? Infinity) - (a.place ?? Infinity);
    return a.points - b.points || firstName(a).localeCompare(firstName(b));
  });
}

// Number of pools that hold teams (the highest populated pool's position).
export function populatedPoolCount(teams: { pool_id: string }[]): number {
  let count = 0;
  POOL_LETTERS.forEach((letter, i) => {
    if (teams.some((t) => t.pool_id === poolId(letter))) count = i + 1;
  });
  return count;
}

// The configured count can be lower than what's actually in the data
// (imported rounds can have up to 4 pools); never hide a pool that has teams.
export function visiblePoolCount(configuredCount: number, teams: { pool_id: string }[]): number {
  return Math.max(configuredCount, populatedPoolCount(teams));
}

export function buildLayout<T extends PoolTeam>(teams: T[], poolCount: number): Layout<T> {
  const layout: Layout<T> = {};
  for (const letter of POOL_LETTERS.slice(0, poolCount)) {
    layout[letter] = sortPoolTeams(teams.filter((t) => t.pool_id === poolId(letter)));
  }
  return layout;
}

// Moves a team so it sits at gap `toIndex` (0 = before the first team, length =
// after the last) of pool `toLetter`, as the gap looks before the team is lifted
// out. Returns the same object when nothing would change.
export function movePoolTeam<T extends { id: string }>(
  layout: Layout<T>,
  teamId: string,
  toLetter: string,
  toIndex: number
): Layout<T> {
  const fromLetter = Object.keys(layout).find((letter) => layout[letter].some((t) => t.id === teamId));
  if (!fromLetter || !layout[toLetter]) return layout;

  const fromIndex = layout[fromLetter].findIndex((t) => t.id === teamId);
  const team = layout[fromLetter][fromIndex];
  const gap = Math.min(Math.max(toIndex, 0), layout[toLetter].length);
  // Lifting the team out shifts later gaps of its own pool up by one.
  const insertAt = fromLetter === toLetter && fromIndex < gap ? gap - 1 : gap;
  if (fromLetter === toLetter && insertAt === fromIndex) return layout;

  const next: Layout<T> = { ...layout, [fromLetter]: layout[fromLetter].filter((t) => t.id !== teamId) };
  const target = next[toLetter].slice();
  target.splice(insertAt, 0, team);
  next[toLetter] = target;
  return next;
}

export function layoutIds<T extends { id: string }>(layout: Layout<T>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(layout).map(([letter, teams]) => [letter, teams.map((t) => t.id)]));
}
