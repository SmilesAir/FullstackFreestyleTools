'use client';

import { useEffect, useRef, useState } from 'react';
import { CATEGORY_NOTES, type DifficultyLine, type JudgeNote, type NoteCategory, type OtherCurve } from '@/lib/judging';
import type { CurveScore } from '@/lib/score-curve';
import { ScoreGraph } from '@/app/judge/_components/ScoreGraph';
import { adjustedScore } from '@/lib/judging-estimate';
import { Numberline } from './Numberline';
import { NOTE_STYLE } from './noteStyles';
import { RatingBar } from './RatingBar';
import { OthersLegend } from './OthersLegend';
import { ScoreAdjuster } from './ScoreAdjuster';


type Props = {
  category: NoteCategory;
  teamName: string | null;
  // Difficulty only: the numberline, the judge's notes (to find where a picked
  // dot was placed) and the way to change one.
  line: DifficultyLine | null;
  notes: readonly JudgeNote[];
  onEdit: (noteId: string, rating: string, position: number) => void;
  scores: readonly CurveScore[];
  // The other categories' judges, averaged, drawn faintly under the graph.
  others: readonly OtherCurve[];
  duration: number;
  routineSeconds: number;
  estimate: number;
  // The judge's change to the estimate in percent (0 = as the computer made it),
  // and a step to add to it.
  adjustPercent: number;
  onAdjust: (step: number) => void;
  // How far into the routine it is now: notes can't be added after this.
  elapsedSeconds: number;
  // False when notes can no longer be changed (the routine is no longer running).
  canEdit: boolean;
  onInsert: (noteType: string, atSeconds: number, position?: number) => void;
  onDelete: (noteId: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  // A submit is on its way to the server.
  submitting: boolean;
};

// Full-screen pop-up shown when the judge is ready to score: the notes as a
// graph, and the computer's baseline estimate, with Back and Submit. The graph
// can be edited: tap it to put a cursor at a moment, then press a note to add
// one there; or tap a note's dot to select it, then press Delete.
export function ScoreDialog({ open, ...props }: Props & { open: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);

  // A native dialog gives focus handling and Escape for free.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        props.onBack();
      }}
      aria-label="Enter score"
      className="fixed inset-0 m-0 h-dvh max-h-none w-dvw max-w-none flex-col gap-3 border-0 bg-background p-3 text-foreground open:flex"
    >
      {/* Only while open, so the cursor starts fresh each time. */}
      {open && <Body {...props} />}
    </dialog>
  );
}

function Body({
  category,
  teamName,
  line,
  notes,
  onEdit,
  scores,
  others,
  duration,
  routineSeconds,
  estimate,
  adjustPercent,
  onAdjust,
  elapsedSeconds,
  canEdit,
  onInsert,
  onDelete,
  onBack,
  onSubmit,
  submitting,
}: Props) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Difficulty: where on the numberline the judge has picked, for a new note at
  // the cursor or, with a note selected, the position to move it to.
  const [position, setPosition] = useState<number | null>(null);
  // Notes can be added anywhere from the start up to now.
  const at = cursor === null ? null : Math.min(Math.max(0, cursor), elapsedSeconds);
  const ready = at !== null && canEdit;
  // The picked note, if it is still there (it may have been removed meanwhile).
  const selected = selectedId === null ? null : (scores.find((s) => s.id === selectedId) ?? null);
  // The estimate with the judge's change; 2 decimals so a 1% step always shows.
  const adjusted = adjustedScore(estimate, adjustPercent);

  return (
    <>
      {/* The graph keeps its full height; the note buttons and Back/Submit
          shrink to fit what is left of the screen. */}
      <div className="flex shrink-0 items-baseline justify-between gap-3">
        <h2 className="text-2xl font-bold">Enter score</h2>
        {teamName && <div className="min-w-0 truncate text-base font-semibold">{teamName}</div>}
      </div>

      <div className="flex shrink-0 flex-col gap-1">
        <ScoreGraph
          scores={scores}
          underlays={others}
          heightFactor={0.6}
          duration={duration}
          routineSeconds={routineSeconds}
          cursor={at}
          selectedId={selected?.id ?? null}
          onCursorChange={(seconds, scoreId) => {
            setCursor(seconds);
            if (scoreId !== null) setPosition(notes.find((n) => n.id === scoreId)?.linePosition ?? null);
            else if (selectedId !== null) setPosition(null);
            setSelectedId(scoreId);
          }}
        />
        <OthersLegend others={others} />
      </div>

      {category === 'Diff' && line ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <Numberline
            line={line}
            marker={position}
            disabled={!canEdit}
            onPick={(picked) => setPosition(picked)}
            popup={
              <RatingBar
                // Rating needs a note picked, or a moment on the graph to put a new one at.
                disabled={!canEdit || (!selected && at === null)}
                onRate={(rating) => {
                  if (position === null) return;
                  if (selected?.id) onEdit(selected.id, rating, position);
                  else if (at !== null) onInsert(rating, at, position);
                  setSelectedId(null);
                  setPosition(null);
                }}
                onCancel={() => {
                  setSelectedId(null);
                  setPosition(null);
                }}
                onDelete={
                  selected?.id && canEdit
                    ? () => {
                        onDelete(selected.id!);
                        setSelectedId(null);
                        setPosition(null);
                      }
                    : undefined
                }
              />
            }
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-col gap-2">
          <div className="grid min-h-0 auto-rows-[minmax(2.5rem,5rem)] grid-cols-2 gap-2">
            {CATEGORY_NOTES[category].map((note) => (
              <button
                key={note.type}
                type="button"
                disabled={!ready}
                onClick={() => at !== null && onInsert(note.type, at)}
                className={`h-full cursor-pointer rounded-lg px-2 text-xl font-bold leading-tight shadow-sm transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${NOTE_STYLE[note.type]}`}
              >
                {note.fullLabel}
              </button>
            ))}
            <button
              type="button"
              disabled={!selected || !canEdit}
              onClick={() => {
                if (!selected?.id) return;
                onDelete(selected.id);
                setSelectedId(null);
              }}
              className="h-full cursor-pointer rounded-lg border-2 border-red-600 bg-background px-2 text-xl font-bold leading-tight text-red-700 transition active:scale-[0.97] disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-400 disabled:active:scale-100"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="flex shrink-0 items-center justify-between gap-3 rounded border border-gray-300 px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm leading-tight">Baseline Estimate</span>
          <span className="font-mono text-4xl font-bold leading-tight tabular-nums">{estimate}</span>
        </div>
        <ScoreAdjuster onAdjust={onAdjust}>
          <div className="flex min-w-[4ch] flex-col items-center">
            <span className="text-sm leading-tight">Your Score</span>
            <span className="font-mono text-4xl font-bold leading-tight tabular-nums">{adjusted}</span>
          </div>
        </ScoreAdjuster>
      </div>

      <div className="flex min-h-14 shrink basis-32 gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-full flex-1 cursor-pointer rounded-xl border-2 border-gray-300 text-2xl font-bold hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="h-full flex-1 cursor-pointer rounded-xl bg-green-600 text-2xl font-bold text-white hover:bg-green-700 disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </>
  );
}
