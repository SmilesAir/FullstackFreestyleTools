import crypto from 'node:crypto';
import { batchInsert } from './batchInsert.js';

const CATEGORIES = ['ranking-open', 'ranking-women'];

export async function insertRankings(client, { data, insertedResultIds, playerIdMap }, warnings) {
  const rankingRows = [];
  const pointsRows = [];

  for (const category of CATEGORIES) {
    const entries = data.pointsData[category] ?? [];
    for (const entry of entries) {
      if (!playerIdMap.has(entry.id)) {
        warnings.push(`rankings: ${category} entry for "${entry.fullName}" references unresolved player "${entry.id}", skipped`);
        continue;
      }

      const rankingId = crypto.randomUUID();
      rankingRows.push([
        rankingId,
        playerIdMap.get(entry.id),
        category,
        typeof entry.rank === 'number' ? entry.rank : null,
        typeof entry.points === 'number' ? entry.points : null,
        typeof entry.resultsCount === 'number' ? entry.resultsCount : null,
      ]);

      for (const item of entry.pointsList ?? []) {
        const resultsId = insertedResultIds.has(item.resultsId) ? item.resultsId : null;
        if (!resultsId) {
          warnings.push(`ranking_points: ${category} entry for "${entry.fullName}" has unresolved resultsId "${item.resultsId}", storing NULL`);
        }
        pointsRows.push([crypto.randomUUID(), rankingId, resultsId, item.points]);
      }
    }
  }

  const ratingSkipped = (data.pointsData['rating-open'] ?? []).length;
  if (ratingSkipped > 0) {
    warnings.push(`rankings: skipped ${ratingSkipped} "rating-open" entries (incompatible shape, no target table)`);
  }

  const rankingColumns = ['id', 'player_id', 'category', 'rank', 'points', 'results_count'];
  const rankingsInserted = await batchInsert(client, 'rankings', rankingColumns, rankingRows);

  const pointsColumns = ['id', 'ranking_id', 'division_id', 'points'];
  const pointsInserted = await batchInsert(client, 'ranking_points', pointsColumns, pointsRows);

  return { rankingsInserted, pointsInserted, ratingSkipped };
}
