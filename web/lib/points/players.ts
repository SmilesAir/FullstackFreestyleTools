import type { PlayerMap, PlayerRecord } from './types';

// The main player behind an id: follows alias links until there are no more, the
// link leads nowhere, or it loops. Undefined for an id that isn't a player.
export function originalPlayer(id: string, players: PlayerMap): PlayerRecord | undefined {
  let player = players.get(id);
  if (!player) return undefined;
  const seen = new Set<string>([player.id]);
  while (player.aliasId) {
    const next = players.get(player.aliasId);
    if (!next || seen.has(next.id)) break;
    seen.add(next.id);
    player = next;
  }
  return player;
}

const has = (text: string | null): text is string => text !== null && text.length > 0;

export function fullName(player: PlayerRecord): string {
  if (has(player.firstName) && has(player.lastName)) return `${player.firstName} ${player.lastName}`;
  if (has(player.firstName)) return player.firstName;
  if (has(player.lastName)) return player.lastName;
  return '';
}
