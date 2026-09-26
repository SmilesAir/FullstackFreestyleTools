'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import type { JudgedRoutine, JudgeHistory, JudgeState, NoteCategory, OtherCurve, UpcomingTeam } from '@/lib/judging';
import { graphExtent, ScoreGraph } from '@/app/judge/_components/ScoreGraph';
import { baselineEstimate, type CurveScore } from '@/lib/score-curve';
import { graphDuration, noteScores } from './noteScores';
import { OthersLegend } from './OthersLegend';
import { ScoreCard } from './ScoreCard';
import { useScoreAdjust } from './useScoreAdjust';

// Saves a score again with a new change in percent, for the running routine or
// (given its id) an earlier one; says whether it worked.
type SubmitFn = (adjustPercent: number, routineId?: string) => Promise<boolean>;

type Extent = { max: number; min: number };
const NO_OTHERS: OtherCurve[] = [];
const NO_SCORES: CurveScore[] = [];

// Every team the judge has judged or is judging, in the order they played: the
// earlier routines, then the running (or latest) one live, then the rest of the
// pool still to play as empty graphs. All the graphs share one height axis, so
// their shapes can be compared.
export function NotesReview({
  category,
  eventId,
  playerId,
  state,
  onSubmit,
  onSubmitBackup,
  submitting,
}: {
  category: NoteCategory;
  eventId: string;
  playerId: string;
  state: JudgeState;
  onSubmit: SubmitFn;
  // The backup score for a team that hasn't played (the server makes its routine).
  onSubmitBackup: (adjustPercent: number, teamId: string) => Promise<boolean>;
  submitting: boolean;
}) {
  const [history, setHistory] = useState<JudgeHistory>({ routines: [], upcoming: [] });
  const [historyError, setHistoryError] = useState(false);
  // Counts the changes made to earlier scores, so the list is read again.
  const [changes, setChanges] = useState(0);

  // Earlier routines don't change, so the list is read when the tab opens and
  // again when the latest routine or its score, the running routine, or the
  // pool changes (not on every poll).
  const latestKey = [
    state.notesRoutine?.id,
    state.submitted?.score,
    state.routineId,
    state.poolTitle,
    state.judging,
    changes,
  ].join(':');
  useEffect(() => {
    let current = true;
    const query = new URLSearchParams({ event: eventId, player: playerId, category });
    fetch(`/api/judge/history?${query}`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<JudgeHistory>;
      })
      .then((list) => {
        if (!current) return;
        setHistory(list);
        setHistoryError(false);
      })
      .catch(() => current && setHistoryError(true));
    return () => {
      current = false;
    };
  }, [eventId, playerId, category, latestKey]);

  const currentId = state.notesRoutine?.id;
  const earlier = useMemo(() => history.routines.filter((r) => r.id !== currentId), [history.routines, currentId]);

  // The other judges, averaged, for the live routine (it is in the list too).
  const currentOthers = useMemo(
    () => history.routines.find((r) => r.id === currentId)?.others ?? NO_OTHERS,
    [history.routines, currentId]
  );

  // The highest and lowest points of any graph on the tab, averaged lines included.
  const extent = useMemo<Extent>(() => {
    const all: Extent = { max: 0, min: 0 };
    const add = (scores: CurveScore[], routineSeconds: number, others: readonly OtherCurve[]) => {
      const e = graphExtent(scores, graphDuration(routineSeconds, scores), others);
      all.max = Math.max(all.max, e.max);
      all.min = Math.min(all.min, e.min);
    };
    for (const r of earlier) add(noteScores(r.notes, r.noteWeights, r.startedAt, category), r.routineSeconds, r.others);
    const now = state.notesRoutine;
    if (now) add(noteScores(state.notes, state.noteWeights, now.startedAt, category), now.routineSeconds, currentOthers);
    return all;
  }, [earlier, state.notesRoutine, state.notes, state.noteWeights, category, currentOthers]);

  // The key covers every category that has a line on any graph.
  const legend = useMemo(() => [...earlier.flatMap((r) => r.others), ...currentOthers], [earlier, currentOthers]);

  // Every team in order, each with the pool it belongs to, so the division,
  // round and pool are named once above each run of teams from one pool.
  const items: { key: string; poolTitle: string | null; node: React.ReactNode }[] = [
    ...earlier.map((r) => ({
      key: r.id,
      poolTitle: r.poolTitle,
      node: (
        <PastRoutine
          category={category}
          routine={r}
          extent={extent}
          submitting={submitting}
          onSubmit={async (percent, routineId) => {
            const ok = await onSubmit(percent, routineId);
            if (ok) setChanges((n) => n + 1);
            return ok;
          }}
        />
      ),
    })),
    ...(state.notesRoutine || (earlier.length === 0 && history.upcoming.length === 0)
      ? [
          {
            key: 'current',
            poolTitle: history.routines.find((r) => r.id === currentId)?.poolTitle ?? state.poolTitle,
            node: (
              <CurrentRoutine
                category={category}
                state={state}
                extent={extent}
                others={currentOthers}
                onSubmit={onSubmit}
                submitting={submitting}
              />
            ),
          },
        ]
      : []),
    ...history.upcoming.map((team) => ({
      key: team.teamId,
      poolTitle: team.poolTitle,
      node: (
        <UpcomingRoutine
          team={team}
          extent={extent}
          submitting={submitting}
          onSubmit={async (percent) => {
            const ok = await onSubmitBackup(percent, team.teamId);
            if (ok) setChanges((n) => n + 1);
            return ok;
          }}
        />
      ),
    })),
  ];

  return (
    // Packed tight so as many graphs as possible fit on the screen at once.
    <div className="flex w-full flex-col gap-1">
      {historyError && <p className="text-sm text-red-700">Could not load your earlier routines.</p>}
      <OthersLegend others={legend} />
      {items.map((item, i) => {
        const newPool = item.poolTitle !== null && (i === 0 || items[i - 1].poolTitle !== item.poolTitle);
        return (
          <Fragment key={item.key}>
            {newPool && (
              <h2 className="border-t border-gray-300 pt-1 text-sm font-semibold text-gray-600 first:border-t-0 first:pt-0">
                {item.poolTitle}
              </h2>
            )}
            {/* The pool heading already divides it from what came before. */}
            <div className={newPool ? '' : 'border-t border-gray-200 pt-1 first:border-t-0 first:pt-0'}>
              {item.node}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

// A team of the pool that hasn't played yet: an empty graph, so every team of
// the pool has one. A score can still be entered, as a backup for when the
// routine never got started: the first press makes the team's routine and
// submits, and from then on it is listed as played.
function UpcomingRoutine({
  team,
  extent,
  submitting,
  onSubmit,
}: {
  team: UpcomingTeam;
  extent: Extent;
  submitting: boolean;
  onSubmit: (adjustPercent: number) => Promise<boolean>;
}) {
  const { percent, changed, failed, adjust } = useScoreAdjust({
    routineId: `team:${team.teamId}`,
    saved: 0,
    submitting,
    onSubmit,
  });
  return (
    <section>
      <ScoreGraph
        scores={NO_SCORES}
        duration={graphDuration(team.routineSeconds, NO_SCORES)}
        routineSeconds={team.routineSeconds}
        compact
        title={`${team.teamName ?? '(team)'} · not played yet`}
        yExtent={extent}
        aside={
          <ScoreCard
            estimate={0}
            submitted={null}
            percent={percent}
            status={changed ? (failed ? 'Not saved' : 'Saving…') : 'Not played. Press to enter'}
            onAdjust={adjust}
            canEnter
          />
        }
      />
    </section>
  );
}

// An earlier routine: its graph and score. The score can still be changed; the
// notes are locked.
function PastRoutine({
  category,
  routine,
  extent,
  submitting,
  onSubmit,
}: {
  category: NoteCategory;
  routine: JudgedRoutine;
  extent: Extent;
  submitting: boolean;
  onSubmit: SubmitFn;
}) {
  const scores = useMemo(
    () => noteScores(routine.notes, routine.noteWeights, routine.startedAt, category),
    [routine.notes, routine.noteWeights, routine.startedAt, category]
  );
  const estimate = useMemo(
    () => baselineEstimate(scores, routine.routineSeconds, routine.estimate),
    [scores, routine.routineSeconds, routine.estimate]
  );
  // A routine without a score can be scored from here (the backup).
  const { percent, changed, failed, adjust } = useScoreAdjust({
    routineId: routine.id,
    saved: routine.submitted?.adjustPercent ?? 0,
    submitting,
    onSubmit,
  });

  return (
    <section>
      <ScoreGraph
        scores={scores}
        duration={graphDuration(routine.routineSeconds, scores)}
        routineSeconds={routine.routineSeconds}
        compact
        title={routine.teamName ?? '(team)'}
        yExtent={extent}
        underlays={routine.others}
        aside={
          <ScoreCard
            estimate={estimate}
            submitted={routine.submitted}
            percent={percent}
            status={changed ? (failed ? 'Not saved' : 'Saving…') : null}
            onAdjust={adjust}
            canEnter
          />
        }
      />
    </section>
  );
}

// The judge's notes for the running (or latest) routine as a graph, and the
// score, which can be changed and saved again.
function CurrentRoutine({
  category,
  state,
  extent,
  others,
  onSubmit,
  submitting,
}: {
  category: NoteCategory;
  state: JudgeState;
  extent: Extent;
  others: readonly OtherCurve[];
  onSubmit: SubmitFn;
  submitting: boolean;
}) {
  const routine = state.notesRoutine;
  // The running routine is scored with Enter Score on the Play tab; once it is
  // over, a missing score can be entered here (the backup).
  const running = routine !== null && state.routineStartedAt === routine.startedAt;
  const canEnter = routine !== null && !state.submitted && !running;
  const { percent, changed, failed, adjust } = useScoreAdjust({
    routineId: routine && (state.submitted || canEnter) ? routine.id : null,
    saved: state.submitted?.adjustPercent ?? 0,
    submitting,
    onSubmit,
  });

  const scores = useMemo<CurveScore[]>(
    () => (routine ? noteScores(state.notes, state.noteWeights, routine.startedAt, category) : []),
    [state.notes, state.noteWeights, routine, category]
  );

  const estimate = useMemo(
    () => (routine ? baselineEstimate(scores, routine.routineSeconds, state.estimate) : 0),
    [scores, routine, state.estimate]
  );

  if (!routine) {
    return (
      <p className="text-sm text-gray-500">No notes yet. Notes you take on the Play tab appear here as a graph.</p>
    );
  }

  return (
    <div className="w-full">
      <ScoreGraph
        scores={scores}
        duration={graphDuration(routine.routineSeconds, scores)}
        routineSeconds={routine.routineSeconds}
        compact
        title={`${routine.teamName ?? '(team)'}${running ? ' · in progress' : ''}`}
        yExtent={extent}
        underlays={others}
        aside={
          <ScoreCard
            estimate={estimate}
            submitted={state.submitted}
            percent={percent}
            status={changed ? (failed ? 'Not saved' : 'Saving…') : null}
            onAdjust={adjust}
            canEnter={canEnter}
          />
        }
      />
    </div>
  );
}
