import { batchInsert } from './batchInsert.js';

function toTimestamp(ms) {
  return typeof ms === 'number' ? new Date(ms).toISOString() : null;
}

function parseDate(str, key, field, warnings) {
  if (typeof str !== 'string') {
    warnings.push(`events: ${key} missing ${field}`);
    return null;
  }
  const parts = str.split('-');
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) {
    warnings.push(`events: ${key} has unparseable ${field} "${str}"`);
    return null;
  }
  const [y, m, d] = parts;
  return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export async function insertEvents(client, { data }, warnings) {
  const entries = Object.entries(data.eventsData);
  const rows = [];

  for (const [key, event] of entries) {
    const startDate = parseDate(event.startDate, key, 'startDate', warnings);
    const endDate = parseDate(event.endDate, key, 'endDate', warnings);
    if (!startDate || !endDate) continue;

    rows.push([
      key,
      event.eventName ?? '',
      startDate,
      endDate,
      toTimestamp(event.createdAt),
      event.additionalData?.fpaId ?? null,
      event.additionalData?.postName ?? null,
    ]);
  }

  const columns = ['id', 'event_name', 'start_date', 'end_date', 'created_at', 'fpa_id', 'post_name'];
  const inserted = await batchInsert(client, 'events', columns, rows);

  return { inserted, skipped: entries.length - rows.length };
}
