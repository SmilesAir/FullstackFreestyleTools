import type { ParsedSlot } from './player-match-types';

// Parsed teams under review: each written name is matched to a player, or still needs one.
export type Slot = ParsedSlot & { selectedName: string | null; created?: boolean };

// The same name written the same way (ignoring case and extra spaces) is the same person.
export const nameKey = (input: string) => input.trim().replace(/\s+/g, ' ').toLowerCase();

// Gives every still-unresolved slot written like `input` the same player, so fixing a
// name once fixes it wherever it appears. Slots already resolved are left alone.
export function applyResolution(teams: Slot[][], input: string, patch: Partial<Slot>): Slot[][] {
  const key = nameKey(input);
  return teams.map((team) => team.map((slot) => (!slot.selectedId && nameKey(slot.input) === key ? { ...slot, ...patch } : slot)));
}

export const toSlots = (teams: ParsedSlot[][]): Slot[][] =>
  teams.map((team) =>
    team.map((slot) => ({
      ...slot,
      selectedName: slot.selectedId ? (slot.candidates.find((c) => c.id === slot.selectedId)?.name ?? null) : null,
    }))
  );

export function slotCounts(teams: Slot[][]) {
  const all = teams.flat();
  return {
    matched: all.filter((s) => s.status === 'matched' && s.selectedId && !s.created).length,
    review: all.filter((s) => s.status === 'uncertain' && !s.selectedId).length,
    unresolved: all.filter((s) => s.status === 'none' && !s.selectedId).length,
    created: all.filter((s) => s.created).length,
  };
}

// The teams whose every player is picked, as player ids, and how many were left out.
export function completeTeams(teams: Slot[][]) {
  const complete = teams.filter((team) => team.every((s) => s.selectedId));
  return { ids: complete.map((team) => team.map((s) => s.selectedId as string)), skipped: teams.length - complete.length };
}
