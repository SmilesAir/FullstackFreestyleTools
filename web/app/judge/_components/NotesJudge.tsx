'use client';

import { useEffect, useState } from 'react';
import { Tabs, type Tab } from '@/app/_components/Tabs';
import type { JudgeState, NoteCategory } from '@/lib/judging';
import { IDLE_MS, useJudgeNotes } from '@/app/judge/_components/useJudgeNotes';
import { NotesPlay } from './NotesPlay';
import { NotesReview } from './NotesReview';

// A note-taking judge's screen (Execution or Artistic Impression). One hook owns
// the polling and saving so the Play and Review tabs always show the same notes.
export function NotesJudge({
  category,
  eventId,
  playerId,
  judgeName,
  basePath,
  initialTab,
  initial,
  onSaveStatus,
}: {
  category: NoteCategory;
  eventId: string;
  playerId: string;
  judgeName: string;
  basePath: string;
  initialTab: string;
  initial: JudgeState;
  // Told whether everything pressed has been saved (a seat's screen waits for
  // that before switching to another judge).
  onSaveStatus?: (saved: boolean) => void;
}) {
  const judge = useJudgeNotes(eventId, playerId, category, initial);
  const { state } = judge;

  const allSaved = judge.status === 'saved' && !judge.submitting;
  useEffect(() => {
    onSaveStatus?.(allSaved);
  }, [allSaved, onSaveStatus]);

  // When a new routine starts, take the judge to the Play tab (they may be
  // reading Review). Only a change counts: opening the screen mid-routine, or a
  // routine ending, leaves the tab alone.
  const [active, setActive] = useState(initialTab);
  const [seenRoutine, setSeenRoutine] = useState(state.routineId);
  if (seenRoutine !== state.routineId) {
    setSeenRoutine(state.routineId);
    if (state.routineId !== null) setActive('play');
  }

  const tabs: Tab[] = [
    {
      id: 'play',
      label: 'Play',
      href: `${basePath}?tab=play`,
      fill: true,
      content: (
        <NotesPlay
          eventId={eventId}
          playerId={playerId}
          category={category}
          state={state}
          clockOffset={judge.clockOffset}
          canNote={judge.canNote}
          preStartNotes={judge.preStartNotes}
          saveStatus={judge.status}
          onNote={judge.note}
          onRemove={judge.removeLast}
          onInsert={judge.insertNote}
          onEditNote={judge.editNote}
          canEdit={judge.canNote}
          onDelete={judge.removeNote}
          onSubmit={judge.submit}
          submitting={judge.submitting}
        />
      ),
    },
    {
      id: 'review',
      label: 'Review',
      href: `${basePath}?tab=review`,
      content: (
        <NotesReview
          category={category}
          eventId={eventId}
          playerId={playerId}
          state={state}
          onSubmit={judge.submit}
          onSubmitBackup={judge.submitBackup}
          submitting={judge.submitting}
        />
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-2 empty:hidden">
        {!state.judging && (
          <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You&apos;re not judging right now. The head judge may have changed pools. Your earlier notes are still in Review.
          </p>
        )}
        {judge.connection === 'lost' && (
          <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Connection lost. What you press is kept and saved when it comes back.
          </p>
        )}
        {judge.status === 'retrying' && judge.connection !== 'lost' && (
          <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Not saved yet, retrying. What you press is kept.
          </p>
        )}
        {judge.paused && (
          <p className="rounded border border-gray-400 bg-gray-100 px-3 py-2 text-sm text-gray-800">
            Paused after {IDLE_MS / 60000} minutes without activity. Tap anywhere to resume.
          </p>
        )}
        {judge.error && (
          <p className="flex items-center justify-between gap-3 rounded border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
            <span>{judge.error}</span>
            <button type="button" onClick={judge.dismissError} className="underline">
              dismiss
            </button>
          </p>
        )}
      </div>
      <Tabs tabs={tabs} initialActive={initialTab} active={active} onChange={setActive} trailing={
          <>
            {judgeName}
            <span
              className={`ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                judge.mode === 'local' ? 'bg-teal-100 text-teal-900' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {judge.mode === 'local' ? 'Local server' : 'Online'}
            </span>
          </>
        }
        large
      />
    </>
  );
}
