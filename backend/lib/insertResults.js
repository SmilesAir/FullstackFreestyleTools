import { batchInsert } from './batchInsert.js';

function toTimestamp(ms) {
  return typeof ms === 'number' ? new Date(ms).toISOString() : null;
}

export async function insertResults(client, { data, eventIds }, warnings) {
  const entries = Object.entries(data.resultsData);
  const rows = [];
  const insertedIds = new Set();

  for (const [key, result] of entries) {
    if (!eventIds.has(result.eventId)) {
      warnings.push(
        `results: ${key} ("${result.eventName ?? 'unknown event'}") references missing eventId "${result.eventId}", skipped`
      );
      continue;
    }

    rows.push([
      key,
      result.eventId,
      result.divisionName ?? '',
      result.rawText ?? '',
      typeof result.isHidden === 'boolean' ? result.isHidden : null,
      toTimestamp(result.createdAt),
    ]);
    insertedIds.add(key);
  }

  const columns = ['id', 'event_id', 'division_name', 'raw_text', 'is_hidden', 'created_at'];
  const inserted = await batchInsert(client, 'divisions', columns, rows);

  return { inserted, skipped: entries.length - rows.length, insertedIds };
}
