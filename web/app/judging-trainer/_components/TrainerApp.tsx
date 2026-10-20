'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { NoteCategory } from '@/lib/judging';
import { formatElapsed } from '@/lib/head-judge-state';
import {
  currentRoutine,
  endEarly,
  hasPlayed,
  isInsideLength,
  judgeHistory,
  newTestEvent,
  otherCurves,
  poolResults,
  startRoutine,
  trainerJudge,
  TRAINER_EVENT_ID,
  TRAINER_JUDGES,
  TRAINER_POOL,
  TRAINER_TEAMS,
  type TrainerState,
} from '@/lib/judging-trainer';
import { NotesJudgeView } from '@/app/judge/_components/NotesJudge';
import { PoolResultsView } from '@/app/head-judge/_components/PoolResults';
import { DebugBar, type TrainerView } from './DebugBar';
import { TrainerDescription } from './TrainerDescription';
import { TrainerStartGuide } from './TrainerStartGuide';
import { useTrainerJudge, useTrainerStore, type TrainerUpdate } from './useTrainer';

const BASE_PATH = '/judging-trainer';

// The Judging Trainer: a debug bar on top, and under it whichever judge's real
// screen (or the pool's results) is picked. The person plays the head judge and
// every judge: each judge's routine for each team is started from that judge's
// cell in the results' Summary table, so every team is judged three times.
export function TrainerApp() {
  const { state, loaded, update } = useTrainerStore();
  const [view, setView] = useState<TrainerView>('guide');

  // The bar's clock, and whether a routine is still running.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const on = currentRoutine(state);
  const inside = isInsideLength(state, now);
  const onTeam = on ? TRAINER_TEAMS.findIndex((t) => t.id === on.teamId) + 1 : 0;
  const onJudge = on?.category ? trainerJudge(on.category).name : null;
  const status = on
    ? `Team ${onTeam}${onJudge ? ` · ${onJudge}` : ''} · ${formatElapsed(Math.min(now - on.startedAt, on.seconds * 1000))} / ${formatElapsed(on.seconds * 1000)}${inside ? '' : ' · enter the score'}`
    : 'No routine running. Start one from Results.';

  // The debug bar's height (it wraps on a narrow screen), so the judge screen's
  // Enter Score button, fixed to the top, sits below the bar instead of over it.
  const bar = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setBarHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex min-h-dvh flex-col" style={{ '--judge-top-offset': `${barHeight}px` } as React.CSSProperties}>
      <div ref={bar}>
        <DebugBar
          view={view}
          onView={setView}
          onNewEvent={() => {
            if (hasPlayed(state) && !window.confirm('Start a new test event? Every note and score is cleared.')) return;
            update(() => newTestEvent());
          }}
          canEndEarly={inside}
          onEndEarly={() => update((s) => endEarly(s, Date.now()))}
          status={status}
        />
      </div>
      {!loaded ? null : view === 'guide' ? (
        <TrainerStartGuide onView={setView} />
      ) : view === 'description' ? (
        <TrainerDescription />
      ) : view === 'results' ? (
        <TrainerResults
          state={state}
          running={inside}
          onStart={(teamId, category) => {
            update((s) => startRoutine(s, teamId, category, Date.now()));
            setView(category);
          }}
          onOpen={setView}
        />
      ) : (
        <main className="flex w-full flex-1 flex-col gap-2 px-2 py-3">
          <TrainerJudgeScreen key={view} state={state} update={update} category={view} />
        </main>
      )}
    </div>
  );
}

function TrainerJudgeScreen({
  state,
  update,
  category,
}: {
  state: TrainerState;
  update: TrainerUpdate;
  category: NoteCategory;
}) {
  const judge = useTrainerJudge(state, update, category);
  const history = useMemo(() => judgeHistory(state, category), [state, category]);
  const others = useMemo(() => otherCurves(state, category, state.currentRoutineId), [state, category]);
  const { playerId, name } = trainerJudge(category);
  // Once a run is over, Enter Score is for the judge it was started for and
  // any other judge who took notes on it, not every judge's screen.
  const on = currentRoutine(state);
  const canEnterScore = !on || on.category === category || judge.state.notes.length > 0;
  return (
    <NotesJudgeView
      judge={judge}
      category={category}
      eventId={TRAINER_EVENT_ID}
      playerId={playerId}
      judgeName={name}
      basePath={BASE_PATH}
      initialTab="play"
      badge="Trainer"
      others={others}
      history={history}
      canEnterScore={canEnterScore}
    />
  );
}

const cellButton = 'cursor-pointer rounded px-2 py-0.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40';

// The pool's results, with a Start button in each judge's score cell that has
// no score yet: it starts that team's routine for that judge and opens their
// screen. While a routine runs the others wait (end it early to move on); the
// cell of the routine on stage takes the judge back to it.
function TrainerResults({
  state,
  running,
  onStart,
  onOpen,
}: {
  state: TrainerState;
  running: boolean;
  onStart: (teamId: string, category: NoteCategory) => void;
  onOpen: (category: NoteCategory) => void;
}) {
  const data = useMemo(() => poolResults(state), [state]);
  const on = currentRoutine(state);
  const scoreCell = (teamId: string, judgePlayerId: string, score: number | null) => {
    if (score !== null) return undefined;
    const category = TRAINER_JUDGES.find((j) => j.playerId === judgePlayerId)?.categoryType;
    if (!category) return undefined;
    if (on && on.teamId === teamId && on.category === category) {
      return (
        <button type="button" onClick={() => onOpen(category)} className={`${cellButton} bg-sky-100 text-sky-900`}>
          {running ? 'Judging…' : 'Enter score'}
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled={running}
        title={running ? 'A routine is running. Wait for it, or end it early.' : undefined}
        onClick={() => onStart(teamId, category)}
        className={`${cellButton} bg-green-600 text-white hover:bg-green-700`}
      >
        Start
      </button>
    );
  };
  return (
    <main className="flex flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">
        {TRAINER_POOL.divisionName} · {TRAINER_POOL.roundName} · Pool {TRAINER_POOL.letter}
      </h1>
      <p className="text-sm text-gray-600">
        Press Start under a judge to play that team&apos;s routine for that judge, then judge it on their screen.
      </p>
      <PoolResultsView pool={TRAINER_POOL} data={data} scoreCell={scoreCell} />
    </main>
  );
}
