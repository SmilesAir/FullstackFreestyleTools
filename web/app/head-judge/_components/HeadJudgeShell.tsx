'use client';

import { useMemo, useState } from 'react';
import { Tabs, type Tab } from '../../_components/Tabs';
import { flattenPools, type HeadJudgeDivision } from '@/lib/head-judge';
import type { PlayResponse } from '@/lib/head-judge-state';
import { PlayTab } from './PlayTab';
import { PoolsTab } from './PoolsTab';
import { ResultsTab } from './ResultsTab';
import { usePlayState } from './usePlayState';
import { useT } from '@/lib/i18n/client';

// Holds what the tabs share. The play state (which pool and team, and the
// routine's start) is saved on the server and shared with other screens; which
// pool's results are open is just this screen's choice.
export function HeadJudgeShell({
  eventId,
  initialTab,
  divisions,
  initialPlay,
  eventsContent,
  settingsContent,
}: {
  eventId: string | null;
  initialTab: string;
  divisions: HeadJudgeDivision[];
  initialPlay: PlayResponse;
  eventsContent: React.ReactNode;
  settingsContent: React.ReactNode;
}) {
  const t = useT();
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
    // The first team in play order is up to start with.
    if (pool.teams[0]) play.setTeam(pool.teams[0].id);
    setTab('play');
  }

  const noEvent = <p className="text-sm text-gray-500">{t.headJudge.chooseEvent}</p>;
  const href = (id: string) => (eventId ? `/head-judge?event=${eventId}&tab=${id}` : `/head-judge?tab=${id}`);

  const tabs: Tab[] = [
    { id: 'events', label: t.headJudge.tabs.events, href: href('events'), content: eventsContent },
    {
      id: 'pools',
      label: t.headJudge.tabs.pools,
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
      label: t.headJudge.tabs.play,
      href: href('play'),
      content: eventId ? (
        <PlayTab
          eventId={eventId}
          active={tab === 'play'}
          pool={playing}
          playingTeamId={play.state.teamId}
          routineStartedAt={play.state.routineStartedAt}
          finishedJudges={play.state.finishedJudges}
          clockOffset={play.clockOffset}
          saveStatus={play.status}
          presence={play.presence}
          mode={play.mode}
          onSelectTeam={play.setTeam}
          onStart={play.start}
          judgesReady={play.state.judgesReady}
          onSetReady={play.setReady}
          onCancel={play.cancel}
          onNextTeam={play.nextTeam}
          restorableRoutineId={play.state.restorableRoutineId}
          onAdjustStart={play.adjustStart}
          onRestore={play.restore}
        />
      ) : (
        noEvent
      ),
    },
    {
      id: 'results',
      label: t.headJudge.tabs.results,
      href: href('results'),
      content: eventId ? <ResultsTab
          eventId={eventId}
          active={tab === 'results'}
          divisions={divisions}
          selectedKey={resultsKey}
          onSelect={setResultsKey}
        /> : noEvent,
    },
    {
      id: 'settings',
      label: t.headJudge.tabs.settings,
      href: href('settings'),
      content: eventId ? settingsContent : noEvent,
    },
  ];

  return (
    <>
      {eventId && play.connection === 'lost' && (
        <p className="mb-3 rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t.headJudge.connectionLost}
        </p>
      )}
      {eventId && play.error && (
        <p className="mb-3 flex items-center justify-between rounded border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
          <span>{play.error}</span>
          <button type="button" onClick={play.dismissError} className="underline">
            {t.judging.dismiss}
          </button>
        </p>
      )}
      <Tabs tabs={tabs} initialActive={initialTab} active={tab} onChange={setTab} />
    </>
  );
}
