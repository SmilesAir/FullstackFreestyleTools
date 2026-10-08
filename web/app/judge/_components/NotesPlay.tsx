'use client';

import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_NOTES, noteGroups, type JudgeNote, type JudgeState, type NoteCategory } from '@/lib/judging';
import { elapsedMs, formatElapsed } from '@/lib/head-judge-state';
import type { SaveStatus } from '@/app/judge/_components/useJudgeNotes';
import { NOTE_STYLE, NOTE_TINT } from './noteStyles';
import { baselineEstimate } from '@/lib/score-curve';
import { graphDuration, noteScores } from './noteScores';
import { DifficultyPlay } from './DifficultyPlay';
import { ScoreDialog } from './ScoreDialog';
import { useOtherCurves } from './useOtherCurves';

// A note-taking judge's Play tab: a row of buttons per note (best first for
// Execution; by area, under its heading, for Artistic Impression).
export function NotesPlay({
  eventId,
  playerId,
  category,
  state,
  clockOffset,
  canNote,
  preStartNotes,
  saveStatus,
  onNote,
  onRemove,
  onInsert,
  onEditNote,
  canEdit,
  onDelete,
  onSubmit,
  submitting,
}: {
  eventId: string;
  playerId: string;
  category: NoteCategory;
  state: JudgeState;
  clockOffset: number;
  canNote: boolean;
  // Tapped before the routine id was confirmed (the head-judge-start-to-this-
  // judge's-poll gap); shown in place of state.notes until it is.
  preStartNotes: JudgeNote[];
  saveStatus: SaveStatus;
  // A Difficulty note is a rating, the position it was placed at on the numberline and when that was tapped.
  onNote: (noteType: string, position?: number, tappedAt?: number) => void;
  onRemove: (noteType: string) => void;
  onInsert: (noteType: string, atSeconds: number, position?: number) => void;
  onEditNote: (noteId: string, rating: string, position: number) => void;
  canEdit: boolean;
  onDelete: (noteId: string) => void;
  // Saves the score with the judge's change in percent; says whether it worked.
  onSubmit: (adjustPercent: number) => Promise<boolean>;
  submitting: boolean;
}) {
  const running = state.routineStartedAt !== null;

  // Redraw the timer while a routine is running; the time itself comes from the
  // start time, so it is right whenever it's drawn.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!running) return;
    const first = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [running]);
  const elapsedNow = running && now !== null ? elapsedMs(state.routineStartedAt, now, clockOffset) : 0;
  const elapsed = formatElapsed(elapsedNow);
  // Once the timer reaches the routine length it is time to enter the score.
  const atLength = running && elapsedNow >= state.routineSeconds * 1000;

  // Which routine the score dialog was opened for, so a cancelled or restarted
  // routine starts fresh. Whether a score was submitted comes from the server.
  const [dialogFor, setDialogFor] = useState<number | null>(null);
  const dialogOpen = atLength && dialogFor === state.routineStartedAt;
  // The other categories' judges, averaged, drawn under the graph in the dialog.
  const others = useOtherCurves(eventId, playerId, category, state.routineId, dialogOpen);
  const submitted = running && state.submitted !== null && state.notesRoutine?.id === state.routineId;
  // The judge's change to the baseline estimate, in percent, for one routine.
  const [adjust, setAdjust] = useState<{ for: number | null; percent: number }>({ for: null, percent: 0 });
  const adjustPercent = adjust.for === state.routineStartedAt ? adjust.percent : 0;

  // Once running, the server's (+ still-sending) notes; before that, anything
  // tapped early while waiting for the real routine id (preStartNotes) - never
  // a previous routine's now-stale notes, which server.notes would otherwise be.
  const notes = running ? state.notes : preStartNotes;
  const counts = new Map<string, number>();
  for (const n of notes) counts.set(n.noteType, (counts.get(n.noteType) ?? 0) + 1);

  // The notes as graph points and the baseline estimate from them, worked out
  // only once it is time to score (and not on every tick of the timer).
  const { scores, estimate } = useMemo(() => {
    if (!atLength || state.routineStartedAt === null) return { scores: [], estimate: 0 };
    const points = noteScores(state.notes, state.noteWeights, state.routineStartedAt, category);
    return { scores: points, estimate: baselineEstimate(points, state.routineSeconds, state.estimate) };
  }, [atLength, category, state.notes, state.noteWeights, state.routineStartedAt, state.routineSeconds, state.estimate]);

  // Seven rows (Artistic Impression) get a lower floor than five, so they fit a phone.
  const rowMinHeight = CATEGORY_NOTES[category].length > 5 ? 'min-h-14' : 'min-h-20';

  const waiting = !state.poolTitle
    ? 'No pool is playing yet.'
    : !state.teamName
      ? 'Waiting for the head judge to choose the team.'
      : !running
        ? 'Starting any moment — go ahead, what you tap now still counts.'
        : null;

  return (
    <div className="flex w-full flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-[14.4px] font-bold leading-tight">{state.teamName ?? '(no team up)'}</div>
        <div className="flex items-center gap-2">
          {submitted && state.submitted && (
            <span className="text-sm font-medium text-green-700">Score submitted: {state.submitted.score}</span>
          )}
          {/* A fixed-size dot, so saving never changes the layout. */}
          <span
            aria-hidden
            title={saveStatus === 'saving' ? 'Saving' : saveStatus === 'retrying' ? 'Not saved yet, retrying' : ''}
            className={`h-2.5 w-2.5 rounded-full ${
              saveStatus === 'saving' ? 'bg-gray-400' : saveStatus === 'retrying' ? 'bg-amber-500' : 'bg-transparent'
            }`}
          />
          <span className="font-mono text-[17.3px] font-bold leading-tight tabular-nums">{elapsed}</span>
        </div>
      </div>

      {waiting && <p className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-600">{waiting}</p>}

      {category === 'Diff' && state.line ? (
        <DifficultyPlay
          line={state.line}
          notes={notes}
          routineStartedAt={state.routineStartedAt}
          canNote={canNote}
          onAdd={(rating, position, tappedAt) => onNote(rating, position, tappedAt)}
          onEdit={onEditNote}
          onDelete={onDelete}
        />
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          {noteGroups(category).map((group) => (
            // Groups share the height in proportion to how many notes they have.
            <div
              key={group.heading ?? 'notes'}
              className="flex flex-col gap-2"
              style={{ flexGrow: group.notes.length, flexBasis: 0 }}
            >
              {group.heading && <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{group.heading}</h3>}
              <div className="flex flex-1 flex-col gap-3">
                {group.notes.map((note) => {
                  const count = counts.get(note.type) ?? 0;
                  return (
                    <div key={note.type} className={`flex flex-1 gap-2 ${rowMinHeight}`}>
                      <button
                        type="button"
                        disabled={!canNote || count === 0}
                        onClick={() => onRemove(note.type)}
                        aria-label={`Remove one ${note.fullLabel}`}
                        className={`w-28 shrink-0 cursor-pointer rounded-xl text-3xl font-bold transition active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-30 disabled:active:scale-100 ${NOTE_TINT[note.type]}`}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        disabled={!canNote}
                        onClick={() => onNote(note.type)}
                        className={`flex flex-1 cursor-pointer items-center justify-between gap-4 rounded-xl px-6 text-left text-2xl font-bold shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${NOTE_STYLE[note.type]}`}
                      >
                        <span>{note.label}</span>
                        <span className="min-w-8 text-right font-mono text-xl tabular-nums opacity-80">
                          {count > 0 ? `×${count}` : ''}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {atLength && state.routineStartedAt !== null && (
        <>
          {/* Fixed over the top of the screen (the tabs and team names), so it
              takes no room from the note rows and can't be missed. */}
          {!submitted && (
            <button
              type="button"
              onClick={() => setDialogFor(state.routineStartedAt)}
              className="attention-pulse fixed inset-x-0 top-0 z-30 h-28 cursor-pointer rounded-b-2xl bg-blue-600 text-3xl font-bold text-white"
            >
              Enter Score
            </button>
          )}
          <ScoreDialog
            category={category}
            open={dialogOpen}
            teamName={state.teamName}
            line={state.line}
            notes={state.notes}
            onEdit={onEditNote}
            scores={scores}
            others={others}
            duration={graphDuration(state.routineSeconds, scores)}
            routineSeconds={state.routineSeconds}
            estimate={estimate}
            adjustPercent={adjustPercent}
            onAdjust={(step) => setAdjust({ for: state.routineStartedAt, percent: adjustPercent + step })}
            elapsedSeconds={elapsedNow / 1000}
            canEdit={canEdit}
            onDelete={onDelete}
            onInsert={onInsert}
            onBack={() => setDialogFor(null)}
            submitting={submitting}
            onSubmit={async () => {
              if (await onSubmit(adjustPercent)) setDialogFor(null);
            }}
          />
        </>
      )}
    </div>
  );
}
