import { POOL_LETTERS } from '../event-creator';
import { MAX_ROUND, roundName, type SaveRound } from './types';

// The problems with a set of results, in plain words; an empty list means it can be
// saved. Used by the editor as the person types and again by the server on save.
//
// Places run per pool (that is how every stored multi-pool round is numbered):
// sorted, they must go 1, 2, 3 ... and a tie repeats the number (1, 1, 3).
export function validateResults(rounds: SaveRound[]): string[] {
  if (rounds.length === 0) return ['Add at least one round.'];

  const errors = new Set<string>();
  const seenRounds = new Set<number>();

  for (const round of [...rounds].sort((a, b) => a.round - b.round)) {
    const label = roundName(round.round);
    if (!Number.isInteger(round.round) || round.round < 1 || round.round > MAX_ROUND) {
      errors.add(`Unknown round ${round.round}.`);
      continue;
    }
    if (seenRounds.has(round.round)) errors.add(`${label} appears twice.`);
    seenRounds.add(round.round);
    if (round.pools.length === 0) errors.add(`${label} has no pools.`);

    const inRound = new Set<string>();
    const letters = new Set<string>();
    for (const pool of round.pools) {
      const where = `${label}, Pool ${pool.letter}`;
      if (!(POOL_LETTERS as readonly string[]).includes(pool.letter)) errors.add(`${label} has an unknown pool "${pool.letter}".`);
      if (letters.has(pool.letter)) errors.add(`${label} has Pool ${pool.letter} twice.`);
      letters.add(pool.letter);
      if (pool.teams.length === 0) errors.add(`${where} has no teams.`);

      const places: number[] = [];
      let placesComplete = true;
      pool.teams.forEach((team, i) => {
        const teamLabel = `${where}, team ${i + 1}`;
        if (team.players.length === 0) errors.add(`${teamLabel} has no players.`);
        for (const id of team.players) {
          if (id === null) errors.add(`${teamLabel} has an empty player slot.`);
          else if (inRound.has(id)) errors.add(`A player is on two teams in ${label}.`);
          else inRound.add(id);
        }
        if (Number.isInteger(team.place) && (team.place as number) >= 1) places.push(team.place as number);
        else {
          placesComplete = false;
          errors.add(`${teamLabel} needs a place (a whole number, 1 or more).`);
        }
      });

      if (placesComplete && places.length > 0) {
        places.sort((a, b) => a - b);
        const ok = places[0] === 1 && places.every((p, i) => i === 0 || p === places[i - 1] || p === i + 1);
        if (!ok) errors.add(`${where}: places must run 1, 2, 3 … (a tie repeats the number, like 1, 1, 3). Found ${places.join(', ')}.`);
      }
    }
  }
  return [...errors];
}
