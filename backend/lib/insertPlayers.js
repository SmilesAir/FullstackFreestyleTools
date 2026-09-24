import crypto from 'node:crypto';
import { batchInsert } from './batchInsert.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeGender(raw) {
  if (typeof raw !== 'string') return null;
  const upper = raw.toUpperCase();
  return upper === 'M' || upper === 'F' || upper === 'X' ? upper : null;
}

function toTimestamp(ms) {
  return typeof ms === 'number' ? new Date(ms).toISOString() : null;
}

/**
 * Inserts all players. Returns an idMap from the JSON's own player key to
 * the uuid actually stored (identity for normal records; a freshly
 * generated uuid for the one known non-UUID key), so every other loader
 * can resolve player references through the same map.
 */
export async function insertPlayers(client, { data }, warnings) {
  const entries = Object.entries(data.playersData);
  const idMap = new Map();
  let skipped = 0;

  // First pass: decide the stored id for every insertable player (handles
  // the non-UUID key case) before resolving any alias_id references.
  // Players missing required timestamps are excluded from the map entirely
  // so any reference to them (including another player's aliasKey) is
  // treated as unresolved, same as any other orphan reference.
  for (const [key, player] of entries) {
    if (typeof player.createdAt !== 'number' || typeof player.lastActive !== 'number') {
      warnings.push(`players: ${key} is missing createdAt/lastActive, skipped entirely`);
      skipped += 1;
      continue;
    }
    if (UUID_RE.test(key)) {
      idMap.set(key, key);
    } else {
      const newId = crypto.randomUUID();
      idMap.set(key, newId);
      warnings.push(`players: key "${key}" is not a UUID, generated ${newId}`);
    }
  }

  const rows = [];
  for (const [key] of entries) {
    if (!idMap.has(key)) continue;
    const player = data.playersData[key];
    const id = idMap.get(key);

    let aliasId = null;
    if (player.aliasKey) {
      if (idMap.has(player.aliasKey)) {
        aliasId = idMap.get(player.aliasKey);
      } else {
        warnings.push(`players: ${key} has unresolved aliasKey "${player.aliasKey}", storing NULL`);
      }
    }

    rows.push([
      id,
      player.firstName ?? '',
      player.lastName ?? '',
      aliasId,
      normalizeGender(player.gender),
      player.country || null,
      player.fpaWebsiteId ?? null,
      typeof player.membership === 'number' ? player.membership : null,
      toTimestamp(player.createdAt),
      toTimestamp(player.lastActive),
    ]);
  }

  const columns = [
    'id', 'first_name', 'last_name', 'alias_id', 'gender',
    'country', 'fpa_website_id', 'membership', 'created_at', 'last_active',
  ];
  const inserted = await batchInsert(client, 'players', columns, rows);

  return { inserted, skipped, idMap };
}
