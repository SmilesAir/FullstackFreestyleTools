// Shared (client + server) shapes for matching a written name against real players.

export type Candidate = { id: string; name: string; country: string | null; membership: number | null; score: number };

export type ParsedSlot = {
  input: string;
  status: 'matched' | 'uncertain' | 'none';
  candidates: Candidate[];
  selectedId: string | null;
};
