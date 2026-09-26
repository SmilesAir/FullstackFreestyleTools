import { eventTier } from './divisions';
import type { PointsParams } from './params';
import { fullName, originalPlayer } from './players';
import { orderedRounds } from './rounds';
import type { EventInput, PlayerMap, RatingRow, ResultsInput } from './types';

type Team = { place: number; players: string[]; hash: string };

// A rating is kept per main player. `matchCount` counts matches, not events.
type State = { rating: Map<string, RatingRow> };

// Every team in a division, best first (a higher round number counts as worse than a
// lower one), each team once: the same players listed again are skipped. Which round a
// team is credited with, if it played several, follows the round order setting.
function teamsOf(results: ResultsInput, params: PointsParams): Team[] {
  const teams: Team[] = [];
  const seen = new Set<string>();
  for (const round of orderedRounds(results, params)) {
    for (const team of round.teams) {
      const hash = team.players.join(',');
      if (seen.has(hash)) continue;
      seen.add(hash);
      teams.push({ place: team.place + 1000 * round.round, players: team.players.slice(), hash });
    }
  }
  return teams.sort((a, b) => a.place - b.place);
}

// The mean rating of a team's players (unrated players count as the starting
// rating). Null when none of its players is a known player.
function teamRating(team: Team, players: PlayerMap, state: State, params: PointsParams): number | null {
  let total = 0;
  let count = 0;
  for (const id of team.players) {
    const original = originalPlayer(id, players);
    if (!original) continue;
    total += state.rating.get(original.id)?.rating ?? params.ratings.startingRating;
    ++count;
  }
  return count === 0 ? null : total / count;
}

// Adds `delta` to a team's players, split evenly across the team's size.
function updateTeam(team: Team, delta: number, startDate: string, players: PlayerMap, state: State, params: PointsParams) {
  for (const id of team.players) {
    if (id === undefined || id === null || id.length < 5) continue;
    const original = originalPlayer(id, players);
    if (!original) continue;
    const weight = 1 / team.players.length;
    const existing = state.rating.get(original.id);
    if (existing) {
      existing.rating = Math.max(params.ratings.minRating, existing.rating + weight * delta);
      ++existing.matchCount;
      if (existing.rating > existing.highestRating) {
        existing.highestRating = existing.rating;
        existing.highestRatingDate = startDate;
      }
    } else {
      const rating = params.ratings.startingRating + weight * delta;
      state.rating.set(original.id, {
        id: original.id,
        fullName: fullName(original),
        rating,
        matchCount: 1,
        highestRating: rating,
        highestRatingDate: startDate,
        highestRank: -1,
        highestRankDate: startDate,
      });
    }
  }
}

function playMatch(winner: Team, loser: Team, isTie: boolean, k: number, startDate: string, players: PlayerMap, state: State, params: PointsParams) {
  const rating1 = teamRating(winner, players, state, params);
  const rating2 = teamRating(loser, players, state, params);
  // A team with no known players has no rating: nothing to update.
  if (rating1 === null || rating2 === null) return;

  const scale = params.ratings.eloScale;
  const r1 = Math.pow(10, rating1 / scale);
  const r2 = Math.pow(10, rating2 / scale);
  const expected1 = r1 / (r1 + r2);
  const score1 = isTie ? 0.5 : 1;
  // Worked out as PointsService does (new rating minus old), so the numbers agree to the last digit.
  const delta = rating1 + k * (score1 - expected1) - rating1;

  updateTeam(winner, delta, startDate, players, state, params);
  updateTeam(loser, -delta, startDate, players, state, params);
}

// Elo ratings, one list for every division of every event given. Events are played
// in order of start date, divisions in order of creation. Every team plays each
// team placed below it (the same place is a draw), and each player takes an equal
// share of their team's change.
export function buildRatings(events: EventInput[], players: PlayerMap, params: PointsParams): RatingRow[] {
  const state: State = { rating: new Map() };
  const ordered = [...events].sort((a, b) => a.startMs - b.startMs);

  for (const event of ordered) {
    const divisions = [...event.results].sort((a, b) => a.createdAt - b.createdAt);
    for (const results of divisions) {
      const teams = teamsOf(results, params);
      const tier = eventTier(results.eventName, params);
      const k = tier === 'worlds' ? params.ratings.kWorlds : tier === 'major' ? params.ratings.kMajor : params.ratings.kDefault;

      // A tie is only played if the previous match wasn't against the same team (as PointsService does).
      let lastHash: string | null = null;
      for (let w = 0; w < teams.length; ++w) {
        for (let l = w + 1; l < teams.length; ++l) {
          const isTie = teams[w].place === teams[l].place;
          if (!isTie || lastHash !== teams[l].hash) {
            playMatch(teams[w], teams[l], isTie, k, event.startDate, players, state, params);
            lastHash = teams[l].hash;
          }
        }
      }

      // Peak rank: where each player stands after every division.
      const standing = [...state.rating.values()].sort((a, b) => b.rating - a.rating);
      standing.forEach((player, i) => {
        const rank = i + 1;
        if (player.matchCount > params.ratings.minMatchesForPeakRank && (player.highestRank < 0 || rank < player.highestRank)) {
          player.highestRank = rank;
          player.highestRankDate = event.startDate;
        }
      });
    }
  }
  return [...state.rating.values()].sort((a, b) => b.rating - a.rating);
}
