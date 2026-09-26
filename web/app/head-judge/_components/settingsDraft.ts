import { CATEGORY_NOTES, NOTE_CATEGORIES, type DifficultyLine, type NoteCategory } from '@/lib/judging';
import {
  MAX_AREA_SCALE,
  MAX_LINE_MAX,
  MAX_MOVES,
  MAX_MOVE_NAME,
  MAX_POWER,
  MIN_AREA_SCALE,
  MIN_LINE_MAX,
  MIN_POWER,
  weightRange,
  type SystemSettings,
} from '@/lib/judging-settings';

// Every field of the Settings form is text while it is being edited. Its key is
// the category and the field: "Ex.large_error", "AI.form_bad", "Ex.areaScale",
// "AI.power"; for Difficulty's numberline "Diff.lineMax", and each move
// "Diff.move.<n>.name" / "Diff.move.<n>.position" with "Diff.moves" holding how
// many there are.
export type Draft = Record<string, string>;

export const fieldKey = (category: NoteCategory, field: string) => `${category}.${field}`;

export const LINE_MAX_KEY = fieldKey('Diff', 'lineMax');
const MOVES_KEY = fieldKey('Diff', 'moves');
export const moveKey = (index: number, field: 'name' | 'position') => `Diff.move.${index}.${field}`;

export const rangeOf = (key: string): [number, number] => {
  const [category, field] = key.split('.');
  return field === 'areaScale'
    ? [MIN_AREA_SCALE, MAX_AREA_SCALE]
    : field === 'power'
      ? [MIN_POWER, MAX_POWER]
      : field === 'lineMax'
        ? [MIN_LINE_MAX, MAX_LINE_MAX]
        : weightRange(category as NoteCategory);
};

export const moveCount = (draft: Draft) => Number(draft[MOVES_KEY] ?? 0);

const movesToDraft = (line: DifficultyLine): Draft => {
  const draft: Draft = { [LINE_MAX_KEY]: String(line.max), [MOVES_KEY]: String(line.moves.length) };
  line.moves.forEach((m, i) => {
    draft[moveKey(i, 'name')] = m.name;
    draft[moveKey(i, 'position')] = String(m.position);
  });
  return draft;
};

export const toDraft = (s: SystemSettings): Draft => {
  const draft: Draft = {};
  for (const category of NOTE_CATEGORIES) {
    for (const note of CATEGORY_NOTES[category]) {
      draft[fieldKey(category, note.type)] = String(s[category].noteWeights[note.type]);
    }
    draft[fieldKey(category, 'areaScale')] = String(s[category].estimate.areaScale);
    draft[fieldKey(category, 'power')] = String(s[category].estimate.power);
    const line = s[category].line;
    if (line) Object.assign(draft, movesToDraft(line));
  }
  return draft;
};

// A move added at the end of the list, halfway up the line.
export function addMove(draft: Draft): Draft {
  const n = moveCount(draft);
  if (n >= MAX_MOVES) return draft;
  return { ...draft, [MOVES_KEY]: String(n + 1), [moveKey(n, 'name')]: '', [moveKey(n, 'position')]: '0.5' };
}

// Takes one move out and closes the gap in the keys.
export function removeMove(draft: Draft, index: number): Draft {
  const n = moveCount(draft);
  const next: Draft = {};
  for (const [key, value] of Object.entries(draft)) if (!key.startsWith('Diff.move.')) next[key] = value;
  let to = 0;
  for (let from = 0; from < n; from++) {
    if (from === index) continue;
    next[moveKey(to, 'name')] = draft[moveKey(from, 'name')];
    next[moveKey(to, 'position')] = draft[moveKey(from, 'position')];
    to++;
  }
  next[MOVES_KEY] = String(n - 1);
  return next;
}

export const validText = (draft: Draft, key: string) => {
  const text = draft[key];
  const value = Number(text);
  const [min, max] = rangeOf(key);
  return text !== undefined && text.trim() !== '' && Number.isFinite(value) && value >= min && value <= max;
};

export const validMoveName = (draft: Draft, index: number) => {
  const name = (draft[moveKey(index, 'name')] ?? '').trim();
  return name.length > 0 && name.length <= MAX_MOVE_NAME;
};

export const validMovePosition = (draft: Draft, index: number) => {
  const text = draft[moveKey(index, 'position')] ?? '';
  const value = Number(text);
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 1;
};

const round2 = (draft: Draft, key: string) => Math.round(Number(draft[key]) * 100) / 100;

// The draft as settings, or null while any field is blank or out of range.
export function parseDraft(draft: Draft): SystemSettings | null {
  const settings = {} as SystemSettings;
  for (const category of NOTE_CATEGORIES) {
    const noteWeights: Record<string, number> = {};
    for (const note of CATEGORY_NOTES[category]) {
      const key = fieldKey(category, note.type);
      if (!validText(draft, key)) return null;
      noteWeights[note.type] = round2(draft, key);
    }
    const scale = fieldKey(category, 'areaScale');
    const power = fieldKey(category, 'power');
    if (!validText(draft, scale) || !validText(draft, power)) return null;
    settings[category] = { noteWeights, estimate: { areaScale: round2(draft, scale), power: round2(draft, power) } };

    if (category === 'Diff') {
      if (!validText(draft, LINE_MAX_KEY)) return null;
      const moves: DifficultyLine['moves'] = [];
      for (let i = 0; i < moveCount(draft); i++) {
        if (!validMoveName(draft, i) || !validMovePosition(draft, i)) return null;
        moves.push({
          name: draft[moveKey(i, 'name')].trim(),
          position: Math.round(Number(draft[moveKey(i, 'position')]) * 1000) / 1000,
        });
      }
      settings[category].line = { max: round2(draft, LINE_MAX_KEY), moves };
    }
  }
  return settings;
}
