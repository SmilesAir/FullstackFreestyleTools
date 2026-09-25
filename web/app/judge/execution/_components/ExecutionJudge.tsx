'use client';

import { Tabs, type Tab } from '@/app/_components/Tabs';
import type { JudgeState } from '@/lib/judging';
import { IDLE_MS, useJudgeNotes } from '@/app/judge/_components/useJudgeNotes';
import { ExecutionPlay } from './ExecutionPlay';
import { ExecutionReview } from './ExecutionReview';

// The Execution judge's screen. One hook owns the polling and saving so the
// Play and Review tabs always show the same notes.
export function ExecutionJudge({
  eventId,
  playerId,
  basePath,
  initialTab,
  initial,
}: {
  eventId: string;
  playerId: string;
  basePath: string;
  initialTab: string;
  initial: JudgeState;
}) {
  const judge = useJudgeNotes(eventId, playerId, 'Ex', initial);
  const { state } = judge;

  const tabs: Tab[] = [
    {
      id: 'play',
      label: 'Play',
      href: `${basePath}?tab=play`,
      content: (
        <ExecutionPlay
          state={state}
          clockOffset={judge.clockOffset}
          canNote={judge.canNote}
          saveStatus={judge.status}
          onNote={judge.note}
          onUndo={judge.undoLast}
        />
      ),
    },
    { id: 'review', label: 'Review', href: `${basePath}?tab=review`, content: <ExecutionReview state={state} /> },
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
      <Tabs tabs={tabs} initialActive={initialTab} />
    </>
  );
}
