'use client';

import { Collapsible } from '@/app/events/_components/Collapsible';
import { teamName, type HeadJudgeDivision } from '@/lib/head-judge';
import { useT } from '@/lib/i18n/client';

export function DivisionsTree({ divisions }: { divisions: HeadJudgeDivision[] }) {
  const t = useT();
  if (divisions.length === 0) return <p className="text-sm text-gray-500">{t.eventEditor.noDivisions}</p>;

  return (
    <div className="flex flex-col gap-3">
      {divisions.map((division) => (
        <Collapsible key={division.id} title={division.name} variant="card" defaultOpen={false}>
          {division.rounds.length === 0 ? (
            <p className="text-sm text-gray-500">{t.eventEditor.noRounds}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {division.rounds.map((round) => (
                <Collapsible key={round.number} title={round.name} variant="card" defaultOpen={false}>
                  <div className="flex flex-col gap-2">
                    {round.pools.map((pool) => (
                      <div key={pool.key} className="rounded border border-gray-200 p-2">
                        <div className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-600">
                          {t.common.pool(pool.letter)}
                          {pool.locked && (
                            <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">{t.headJudge.locked}</span>
                          )}
                          {pool.resultsPublished && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">{t.headJudge.published}</span>
                          )}
                        </div>
                        <ul className="flex flex-col gap-0.5 text-sm">
                          {[...pool.teams]
                            .sort((a, b) => (a.place ?? Infinity) - (b.place ?? Infinity))
                            .map((team) => (
                              <li key={team.id} className="flex justify-between gap-2">
                                <span>{teamName(team)}</span>
                                <span className="text-gray-500">{team.place ? `#${team.place}` : '—'}</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Collapsible>
              ))}
            </div>
          )}
        </Collapsible>
      ))}
    </div>
  );
}
