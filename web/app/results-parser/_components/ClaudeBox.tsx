'use client';

import { useState, useTransition } from 'react';
import { parseResultsText } from '@/lib/results-parser-actions';
import type { EventOption, ParsedDivision } from '@/lib/results-parser/types';
import { useT } from '@/lib/i18n/client';

type Found = { eventName: string | null; startDate: string | null; endDate: string | null; divisions: ParsedDivision[]; unparsed: string[] };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const teamCount = (d: ParsedDivision) => d.rounds.reduce((n, r) => n + r.pools.reduce((m, p) => m + p.teams.length, 0), 0);

export function ClaudeBox({
  hasKey,
  events,
  eventId,
  onPickEvent,
  onCreateEvent,
  onLoad,
}: {
  hasKey: boolean;
  events: EventOption[];
  eventId: string;
  onPickEvent: (id: string) => void;
  onCreateEvent: (prefill: { name: string; start: string; end: string }) => void;
  onLoad: (division: ParsedDivision) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(true);
  const [text, setText] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, startParse] = useTransition();

  function parse() {
    setError(null);
    startParse(async () => {
      const result = await parseResultsText(text);
      if (result.error !== null) {
        setError(result.error);
        return;
      }
      setFound(result);
    });
  }

  const matched = found?.eventName ? events.find((e) => norm(e.event_name) === norm(found.eventName as string)) : undefined;

  return (
    <section className="flex flex-col gap-3 rounded border border-gray-300 p-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-2 text-left font-semibold">
        <span className="text-xs">{open ? '▼' : '▶'}</span> {t.resultsParser.fillWithClaude}
      </button>
      {open && (
        <>
          {!hasKey && (
            <p className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t.resultsParser.noKey}
            </p>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={t.resultsParser.pastePlaceholder}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={parse}
            disabled={parsing || !text.trim() || !hasKey}
            className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {parsing ? t.resultsParser.reading : t.resultsParser.fill}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}

          {found && (
            <div className="flex flex-col gap-3 rounded bg-gray-50 p-3 text-sm">
              {found.eventName && (
                <div className="flex flex-wrap items-center gap-2">
                  <span>
                    {t.resultsParser.eventInText} <strong>{found.eventName}</strong>
                    {found.startDate && <> ({found.startDate}{found.endDate && found.endDate !== found.startDate ? t.resultsParser.to(found.endDate) : ''})</>}
                  </span>
                  {matched ? (
                    matched.id === eventId ? (
                      <span className="text-green-700">{t.resultsParser.selected}</span>
                    ) : (
                      <button type="button" onClick={() => onPickEvent(matched.id)} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs">
                        {t.resultsParser.useExisting}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        onCreateEvent({
                          name: found.eventName as string,
                          start: found.startDate ?? '',
                          end: found.endDate ?? found.startDate ?? '',
                        })
                      }
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs"
                    >
                      {t.resultsParser.createIt}
                    </button>
                  )}
                </div>
              )}

              {found.divisions.length === 0 ? (
                <p className="text-amber-800">{t.resultsParser.noneFound}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-gray-700">
                    {t.resultsParser.foundDivisions(found.divisions.length, !!eventId)}
                  </p>
                  {found.divisions.map((d) => (
                    <div key={d.divisionName} className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onLoad(d)}
                        disabled={!eventId}
                        className="rounded bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        {t.resultsParser.load(d.divisionName)}
                      </button>
                      <span className="text-gray-600">
                        {d.rounds.map((r) => t.common.roundName(r.round)).join(', ')} · {t.resultsParser.teamCount(teamCount(d))}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {found.unparsed.length > 0 && (
                <div className="rounded border border-amber-300 bg-amber-50 p-2">
                  <div className="font-medium text-amber-800">{t.resultsParser.leftOut}</div>
                  <ul className="list-disc pl-5 text-amber-900">
                    {found.unparsed.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
