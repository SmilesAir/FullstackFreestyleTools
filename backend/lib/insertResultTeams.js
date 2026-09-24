import crypto from 'node:crypto';
import { batchInsert } from './batchInsert.js';

const ROUND_RE = /^round(\d+)$/i;
const POOL_RE = /^pool(.+)$/i;

export async function insertResultTeams(client, { data, insertedResultIds, playerIdMap }, warnings) {
  const teamRows = [];
  const playerRows = [];

  for (const resultId of insertedResultIds) {
    const nested = data.resultsData[resultId]?.resultsData;
    if (!nested || typeof nested !== 'object') continue;

    for (const [roundKey, round] of Object.entries(nested)) {
      const roundMatch = ROUND_RE.exec(roundKey);
      if (!roundMatch || !round || typeof round !== 'object') continue;
      const roundNumber = Number(roundMatch[1]);

      for (const [poolKey, pool] of Object.entries(round)) {
        const poolMatch = POOL_RE.exec(poolKey);
        if (!poolMatch || !pool || !Array.isArray(pool.teamData)) continue;
        const poolId = `pool${poolMatch[1].toUpperCase()}`;

        for (const team of pool.teamData) {
          const teamId = crypto.randomUUID();
          teamRows.push([
            teamId,
            resultId,
            roundNumber,
            poolId,
            typeof team.place === 'number' ? team.place : null,
            typeof team.points === 'number' ? team.points : null,
          ]);

          for (const playerKey of team.players ?? []) {
            if (playerIdMap.has(playerKey)) {
              playerRows.push([crypto.randomUUID(), teamId, playerIdMap.get(playerKey)]);
            } else {
              warnings.push(
                `team_players: team ${teamId} (division ${resultId}) references unresolved player "${playerKey}", skipped`
              );
            }
          }
        }
      }
    }
  }

  const teamColumns = ['id', 'division_id', 'round_number', 'pool_id', 'place', 'points'];
  const teamsInserted = await batchInsert(client, 'teams', teamColumns, teamRows);

  const playerColumns = ['id', 'team_id', 'player_id'];
  const playersInserted = await batchInsert(client, 'team_players', playerColumns, playerRows);

  return { teamsInserted, playersInserted };
}
