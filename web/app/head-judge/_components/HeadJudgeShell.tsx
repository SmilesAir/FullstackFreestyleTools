'use client';

import { useMemo, useState } from 'react';
import { Tabs, type Tab } from '../../_components/Tabs';
import { flattenPools, type HeadJudgeDivision } from '@/lib/head-judge';
import type { PlayResponse } from '@/lib/head-judge-state';
import { PlayTab } from './PlayTab';
import { PoolsTab } from './PoolsTab';
import { ResultsTab } from './ResultsTab';
import { usePlayState } from './usePlayState';

// Holds what the tabs share. The play state (which pool and team, and the
// routine's start) is saved on the server and shared with other screens; which
// pool's results are open is just this screen's choice.
export function HeadJudgeShell({
  eventId,
  initialTab,
  divisions,
  initialPlay,
  eventsContent,
}: {
  eventId: string | null;
  initialTab: string;
  divisions: HeadJudgeDivision[];
  initialPlay: PlayResponse;
  eventsContent: React.ReactNode;
}) {
  const [tab, setTab] = useState(initialTab);
  const [resultsKey, setResultsKey] = useState<string | null>(null);
  // Without an event there is nothing to play, so the hook is given an id that
  // never resolves and its polling simply reports no connection; nothing shows it.
  const play = usePlayState(eventId ?? '', initialPlay);

  const pools = useMemo(() => flattenPools(divisions), [divisions]);
  const playing =
    pools.find(
      (p) =>
        p.divisionId === play.state.divisionId &&
        p.roundNumber === play.state.roundNumber &&
        p.letter === play.state.poolLetter
    ) ?? null;

  function setPlayingPool(key: string) {
    const pool = pools.find((p) => p.key === key);
    if (!pool) return;
    play.setPool(pool.divisionId, pool.roundNumber, pool.letter);
    setTab('play');
  }

  const noEvent = <p className="text-sm text-gray-500">Choose an event on the Events tab.</p>;
  const href = (id: string) => (eventId ? `/head-judge?event=${eventId}&tab=${id}` : `/head-judge?tab=${id}`);

  const tabs: Tab[] = [
    { id: 'events', label: 'Events', href: href('events'), content: eventsContent },
    {
      id: 'pools',
      label: 'Pools',
      href: href('pools'),
      content: eventId ? (
        <PoolsTab
          divisions={divisions}
          playingKey={playing?.key ?? null}
          routineRunning={play.state.routineStartedAt !== null}
          onSetPlaying={setPlayingPool}
        />
      ) : (
        noEvent
      ),
    },
    {
      id: 'play',
      label: 'Play',
      href: href('play'),
      content: eventId ? (
        <PlayTab
          pool={playing}
          playingTeamId={play.state.teamId}
          routineStartedAt={play.state.routineStartedAt}
          clockOffset={play.clockOffset}
          saveStatus={play.status}
          onSelectTeam={play.setTeam}
          onStart={play.start}
          onCancel={play.cancel}
        />
      ) : (
        noEvent
      ),
    },
    {
      id: 'results',
      label: 'Results',
      href: href('results'),
      content: eventId ? <ResultsTab divisions={divisions} selectedKey={resultsKey} onSelect={setResultsKey} /> : noEvent,
    },
  ];

  return (
    <>
      {eventId && play.connection === 'lost' && (
        <p className="mb-3 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Connection lost. What you do here is kept and saved when it comes back.
        </p>
      )}
      {eventId && play.error && (
        <p className="mb-3 flex items-center justify-between rounded border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>{play.error}</span>
          <button type="button" onClick={play.dismissError} className="underline">
            dismiss
          </button>
        </p>
      )}
      <Tabs tabs={tabs} initialActive={initialTab} active={tab} onChange={setTab} />
    </>
  );
}
