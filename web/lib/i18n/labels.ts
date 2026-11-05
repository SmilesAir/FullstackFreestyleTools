import type { Dictionary } from './dictionaries';

// Names looked up by a stored key (a category type, a note type), falling back to the
// key itself for one the dictionary doesn't know (e.g. an old judging system's).

export function categoryLabel(t: Dictionary, type: string): string {
  return (t.judging.category as Record<string, string>)[type] ?? type;
}

// The short column heading of a stored judge category ('Diff', 'AI', 'Ex', ...).
export function categoryShort(t: Dictionary, type: string): string {
  return (t.results.categoryShort as Record<string, string>)[type] ?? type;
}

export function noteLabel(t: Dictionary, type: string): string {
  return (t.judging.note as Record<string, string>)[type] ?? type;
}

export function noteFullLabel(t: Dictionary, type: string): string {
  return (t.judging.noteFull as Record<string, string>)[type] ?? type;
}

export function noteGroupLabel(t: Dictionary, group: string): string {
  return (t.judging.noteGroup as Record<string, string>)[group] ?? group;
}
