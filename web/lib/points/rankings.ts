import { eventTier, type RankingKind } from './divisions';
import type { PointsParams } from './params';
import { fullName, originalPlayer } from './players';
import { orderedRounds } from './rounds';
import type { PlayerMap, RankingRow, ResultsInput } from './types';

// The points for each place in one division, lowest place first, highest last: a
// geometric run from 1 up to the top score (numPlayers^exponent * K + bonus), each
// rounded to a tenth. A division with one place gives that place the top score.
export function pointsArray(numPlayers: number, numPlaces: number, k: number, bonus: number, exponent: number): number[] {
  const topScore = Math.pow(numPlayers, exponent) * k + bonus;
  const base = Math.pow(topScore, 1 / (numPlaces - 1));
  const points: number[] = [];
  for (let i = 0; i < numPlaces; ++i) {
    points.splice(0, 0, Math.round((topScore / Math.pow(base, i)) * 10) / 10);
  }
  return points;
}

type Entry = { id: string; fullName: string; pointsList: { resultsId: string; points: number }[]; resultsCount: number };

// What each player scored in one division, added to `entries`. The division's
// points are worked out from everyone who played it; every player on a team gets
// the team's full points, and teams on the same place share them. For the women's
// ranking only women get entries.
function addDivision(entries: Map<string, Entry>, results: ResultsInput, players: PlayerMap, kind: RankingKind, params: PointsParams) {
  const rankings = params.rankings;
  const found: { id: string; hash: number }[] = [];
  const seenPlayers = new Set<string>();
  const seenHashes = new Set<number>();

  for (const round of orderedRounds(results, params)) {
    for (const team of round.teams) {
      for (const playerId of team.players) {
        // A player counts once: in the first (best) round they appear in.
        if (seenPlayers.has(playerId)) continue;
        if (!originalPlayer(playerId, players)) continue;
        seenPlayers.add(playerId);
        const hash = round.round * 1000 + team.place;
        found.push({ id: playerId, hash });
        seenHashes.add(hash);
      }
    }
  }
  if (found.length === 0) return;
  found.sort((a, b) => a.hash - b.hash);

  let bonus = 0;
  const tier = eventTier(results.eventName, params);
  if (tier === 'major') bonus = rankings.majorBonus;
  if (tier === 'worlds') bonus = rankings.worldsBonus;

  const points = pointsArray(found.length, seenHashes.size, kind === 'open' ? rankings.kOpen : rankings.kWomen, bonus, rankings.playerExponent);

  let index = points.length - 1;
  let currentHash = found[0].hash;
  for (const player of found) {
    if (currentHash !== player.hash) {
      --index;
      currentHash = player.hash;
    }
    const original = originalPlayer(player.id, players);
    if (!original) continue;
    const entry = entries.get(original.id);
    const item = { resultsId: results.id, points: points[index] };
    if (entry) {
      entry.pointsList.push(item);
      ++entry.resultsCount;
    } else if (kind === 'open' || original.gender === 'F') {
      entries.set(original.id, { id: original.id, fullName: fullName(original), pointsList: [item], resultsCount: 1 });
    }
  }
}

// One ranking from the divisions given (the caller has already chosen which count).
// Each player's best `topResults` results are added and rounded, players are sorted
// by that, and ties share a place (1, 2, 2, 4).
export function buildRankings(results: ResultsInput[], players: PlayerMap, kind: RankingKind, params: PointsParams): RankingRow[] {
  const entries = new Map<string, Entry>();
  for (const division of results) addDivision(entries, division, players, kind, params);

  const rows: RankingRow[] = [];
  for (const entry of entries.values()) {
    entry.pointsList.sort((a, b) => b.points - a.points);
    let sum = 0;
    for (const item of entry.pointsList.slice(0, params.rankings.topResults)) sum += item.points;
    rows.push({ ...entry, points: Math.round(sum), rank: 0 });
  }
  rows.sort((a, b) => b.points - a.points);

  let place = 1;
  let processed = 0;
  let lastPoints = 0;
  for (const row of rows) {
    if (row.points !== lastPoints) {
      lastPoints = row.points;
      place = processed + 1;
    }
    row.rank = place;
    ++processed;
  }
  return rows;
}
