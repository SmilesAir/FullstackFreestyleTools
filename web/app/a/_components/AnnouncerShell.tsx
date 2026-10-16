'use client';

import { useMemo, useState } from 'react';
import { flattenPools, poolTitle, teamName, type HeadJudgeDivision } from '@/lib/head-judge';
import { elapsedMs, formatElapsed } from '@/lib/head-judge-state';
import type { AnnouncerPoll } from '@/lib/announcer';
import { useRoutineNow } from '../../head-judge/_components/useTimecallCallouts';
import { useAnnouncerPoll } from './useAnnouncerPoll';
import { PrintPicker, PrintSheets } from './PrintTeamLists';

export function AnnouncerShell({
  code,
  eventName,
  divisions,
  initialPoll,
}: {
  code: string;
  eventName: string;
  divisions: HeadJudgeDivision[];
  initialPoll: AnnouncerPoll;
}) {
  const { poll, connection, clockOffset } = useAnnouncerPoll(code, initialPoll);
  const [printing, setPrinting] = useState(false);
  // The pools to print, by key.
  const [chosen, setChosen] = useState<string[]>([]);
  const pools = useMemo(() => flattenPools(divisions), [divisions]);

  const playing =
    pools.find(
      (p) => p.divisionId === poll.divisionId && p.roundNumber === poll.roundNumber && p.letter === poll.poolLetter
    ) ?? null;
  const running = poll.routineStartedAt !== null;
  const now = useRoutineNow(running);
  const elapsed = running && now !== null ? elapsedMs(poll.routineStartedAt, now, clockOffset) : 0;
  const playingIndex = playing ? playing.teams.findIndex((t) => t.id === poll.teamId) : -1;
  const over = playing !== null && elapsed > playing.routineSeconds * 1000;

  function togglePrinting() {
    // Opening it with nothing chosen yet starts with the pool on stage.
    if (!printing && chosen.length === 0 && playing) setChosen([playing.key]);
    setPrinting(!printing);
  }

  return (
    <>
      <div className="flex flex-col gap-6 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">Announcer</div>
            <h1 className="text-xl font-semibold">{eventName}</h1>
          </div>
          <button
            type="button"
            onClick={togglePrinting}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
          >
            {printing ? 'Close printing' : 'Print team lists'}
          </button>
        </div>

        {connection === 'lost' && (
          <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Connection lost. Showing the last known state; trying again…
          </p>
        )}

        {printing && (
          <PrintPicker divisions={divisions} chosen={chosen} onChange={setChosen} />
        )}

        {playing ? (
          <section className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold">{poolTitle(playing)}</h2>

            <div className="flex items-baseline gap-3 rounded border border-gray-200 px-4 py-3">
              <span className={`font-mono text-5xl font-semibold tabular-nums ${over ? 'text-red-600' : ''}`}>
                {formatElapsed(elapsed)}
              </span>
              <span className="font-mono text-xl text-gray-500 tabular-nums">
                / {formatElapsed(playing.routineSeconds * 1000)}
              </span>
              <span className={`ml-auto text-sm ${running ? 'text-green-700' : 'text-gray-500'}`}>
                {running ? 'Routine running' : 'Not started'}
              </span>
            </div>

            <ol className="flex flex-col gap-2">
              {playing.teams.map((team, i) => {
                const isPlaying = i === playingIndex;
                const isNext = playingIndex >= 0 && i === playingIndex + 1;
                return (
                  <li
                    key={team.id}
                    className={`flex items-center gap-3 rounded border px-4 py-3 ${
                      isPlaying ? 'border-green-500 bg-green-50 text-green-950' : 'border-gray-200'
                    }`}
                  >
                    <span className="w-6 text-right text-sm text-gray-500 tabular-nums">{i + 1}</span>
                    <span className={`text-lg ${isPlaying ? 'font-semibold' : ''}`}>{teamName(team)}</span>
                    {isPlaying && (
                      <span className="ml-auto rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white">
                        {running ? 'Playing' : 'Up now'}
                      </span>
                    )}
                    {isNext && (
                      <span className="ml-auto rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                        Up next
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : (
          <p className="text-sm text-gray-500">No pool on stage yet. This page follows the Head Judge on its own.</p>
        )}
      </div>

      <PrintSheets pools={pools.filter((p) => chosen.includes(p.key))} eventName={eventName} />
    </>
  );
}
