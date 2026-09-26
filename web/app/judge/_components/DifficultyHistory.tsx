'use client';

import { useEffect, useRef } from 'react';
import { noteFullLabel, type JudgeNote } from '@/lib/judging';
import { NOTE_TINT } from './noteStyles';

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// The Difficulty judge's notes so far, oldest to newest, in one row that scrolls
// sideways (it follows the newest note). Each shows when it was taken, its
// rating, and where on the numberline it sits (no numbers). Tapping one picks it
// to be changed.
export function DifficultyHistory({
  notes,
  routineStartedAt,
  selectedId,
  onSelect,
  disabled = false,
}: {
  notes: readonly JudgeNote[];
  routineStartedAt: number | null;
  selectedId: string | null;
  onSelect: (note: JudgeNote) => void;
  disabled?: boolean;
}) {
  const row = useRef<HTMLDivElement>(null);
  const count = notes.length;
  // A new note scrolls the row to the end; a change to an old one leaves it be.
  useEffect(() => {
    const el = row.current;
    if (el) el.scrollTo({ left: el.scrollWidth });
  }, [count]);

  return (
    <div ref={row} className="flex h-full w-full items-stretch gap-2 overflow-x-auto overflow-y-hidden">
      {count === 0 && (
        <p className="self-center px-2 text-sm text-gray-500">Tap the line to place a move. Your notes show here.</p>
      )}
      {notes.map((note) => {
        const seconds = routineStartedAt === null ? 0 : Math.max(0, (note.notedAt - routineStartedAt) / 1000);
        return (
          <button
            key={note.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(note)}
            aria-label={`${noteFullLabel('Diff', note.noteType)} at ${mmss(seconds)}`}
            className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 text-left transition active:scale-[0.97] disabled:cursor-not-allowed ${NOTE_TINT[note.noteType]} ${
              note.id === selectedId ? 'ring-4 ring-blue-600' : ''
            }`}
          >
            <span className="relative h-10 w-1.5 shrink-0 rounded bg-black/20" aria-hidden="true">
              <span
                className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-current"
                style={{ bottom: `calc(${(note.linePosition ?? 0) * 100}% - 5px)` }}
              />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-base font-bold">{noteFullLabel('Diff', note.noteType)}</span>
              <span className="font-mono text-sm tabular-nums opacity-80">{mmss(seconds)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
