'use client';

import { useState } from 'react';
import type { DifficultyLine, JudgeNote } from '@/lib/judging';
import { DifficultyHistory } from './DifficultyHistory';
import { Numberline } from './Numberline';
import { RatingBar } from './RatingBar';

// What the judge has picked on the numberline but not rated yet: a new move (at
// the time of the tap that placed it), or a saved note being changed.
type Pick = { editId: string | null; position: number; tappedAt: number };

// The Difficulty judge's Play tab: the numberline filling the screen, and under
// it their notes in a row that scrolls sideways. Tapping the line places a move
// and brings up the rating buttons beside the marker. Tapping a note in the
// history picks it to be moved, re-rated or deleted.
export function DifficultyPlay({
  line,
  notes,
  routineStartedAt,
  canNote,
  onAdd,
  onEdit,
  onDelete,
}: {
  line: DifficultyLine;
  notes: readonly JudgeNote[];
  routineStartedAt: number | null;
  canNote: boolean;
  onAdd: (rating: string, position: number, tappedAt: number) => void;
  onEdit: (noteId: string, rating: string, position: number) => void;
  onDelete: (noteId: string) => void;
}) {
  const [picked, setPicked] = useState<Pick | null>(null);
  // A pick means nothing once notes can't change, or once the note it edits is gone.
  const pick = canNote && picked && (picked.editId === null || notes.some((n) => n.id === picked.editId)) ? picked : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Numberline
        line={line}
        marker={pick ? pick.position : null}
        disabled={!canNote}
        popup={
          pick && (
            <RatingBar
              onRate={(rating) => {
                if (pick.editId !== null) onEdit(pick.editId, rating, pick.position);
                else onAdd(rating, pick.position, pick.tappedAt);
                setPicked(null);
              }}
              onCancel={() => setPicked(null)}
              onDelete={
                pick.editId === null
                  ? undefined
                  : () => {
                      onDelete(pick.editId!);
                      setPicked(null);
                    }
              }
            />
          )
        }
        onPick={(position, tappedAt) =>
          setPicked((current) =>
            // Picking again moves the marker; a new move takes the newest tap's time.
            current && current.editId !== null ? { ...current, position } : { editId: null, position, tappedAt }
          )
        }
      />
      <div className="h-16 shrink-0">
        <DifficultyHistory
          notes={notes}
          routineStartedAt={routineStartedAt}
          selectedId={pick?.editId ?? null}
          disabled={!canNote}
          onSelect={(note) => setPicked({ editId: note.id, position: note.linePosition ?? 0.5, tappedAt: 0 })}
        />
      </div>
    </div>
  );
}
