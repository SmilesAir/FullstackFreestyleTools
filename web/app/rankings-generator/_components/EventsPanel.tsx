'use client';

import { useMemo, useState } from 'react';
import { divisionCounts, divisionCountsAtAll } from '@/lib/points/divisions';
import type { PointsParams } from '@/lib/points/params';
import type { GeneratorEvent } from '@/lib/points/load';

// The date `years` before `date` (both "YYYY-MM-DD").
export function yearsBefore(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const result = new Date(Date.UTC(y - years, m - 1, d));
  return result.toISOString().slice(0, 10);
}

const button =
  'cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10';

// Every event with played divisions, chronologically, with checkboxes for the events
// the rankings are made from. A row opens to show its divisions, which can be left out
// one by one.
export function EventsPanel({
  events,
  params,
  selected,
  excluded,
  asOf,
  onAsOf,
  onSelect,
  onExclude,
}: {
  events: GeneratorEvent[];
  params: PointsParams;
  selected: ReadonlySet<string>;
  excluded: ReadonlySet<string>;
  asOf: string;
  onAsOf: (date: string) => void;
  onSelect: (eventIds: readonly string[], on: boolean) => void;
  onExclude: (divisionId: string, on: boolean) => void;
}) {
  const [newestFirst, setNewestFirst] = useState(true);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [search, setSearch] = useState('');

  const ordered = useMemo(() => {
    const list = [...events].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
    return newestFirst ? list.reverse() : list;
  }, [events, newestFirst]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? ordered.filter((event) => event.name.toLowerCase().includes(needle) || event.startDate.startsWith(needle)) : ordered;
  }, [ordered, search]);

  // Grouped by year, in the order shown.
  const years = useMemo(() => {
    const groups: { year: string; events: GeneratorEvent[] }[] = [];
    for (const event of visible) {
      const year = event.startDate.slice(0, 4);
      const last = groups[groups.length - 1];
      if (last && last.year === year) last.events.push(event);
      else groups.push({ year, events: [event] });
    }
    return groups;
  }, [visible]);

  const cutoff = yearsBefore(asOf, 2);
  const counted = (event: GeneratorEvent) => event.divisions.filter((d) => divisionCountsAtAll(d.name, params));

  let selectedDivisions = 0;
  for (const event of events) {
    if (!selected.has(event.id)) continue;
    selectedDivisions += counted(event).filter((d) => !excluded.has(d.id)).length;
  }

  const toggleOpen = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          As of
          <input type="date" value={asOf} onChange={(e) => e.target.value && onAsOf(e.target.value)} className="rounded border border-gray-300 bg-background px-2 py-1.5 text-sm" />
        </label>
        <button
          type="button"
          onClick={() => {
            // Replaces the selection: only events in the last two years.
            onSelect(events.map((e) => e.id), false);
            onSelect(events.filter((e) => e.startDate >= cutoff && e.startDate <= asOf).map((e) => e.id), true);
          }}
          className="cursor-pointer rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Select the last 2 years
        </button>
        <button type="button" onClick={() => onSelect(events.map((e) => e.id), true)} className={button}>
          Select all
        </button>
        <button type="button" onClick={() => onSelect(events.map((e) => e.id), false)} className={button}>
          Select none
        </button>
        <button type="button" onClick={() => setNewestFirst((v) => !v)} className={button}>
          {newestFirst ? 'Newest first' : 'Oldest first'}
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find an event"
          className="min-w-40 flex-1 rounded border border-gray-300 bg-background px-2 py-1.5 text-sm"
        />
      </div>
      <p className="text-sm">
        <span className="font-semibold">
          {selected.size} of {events.length} events
        </span>{' '}
        selected, {selectedDivisions} divisions counted. The last 2 years from {asOf} start on {cutoff}.
      </p>

      <div className="flex flex-col gap-4">
        {years.map((group) => {
          const ids = group.events.map((e) => e.id);
          const all = ids.every((id) => selected.has(id));
          const some = ids.some((id) => selected.has(id));
          return (
            <section key={group.year} className="rounded border border-gray-300">
              <label className="flex cursor-pointer items-center gap-3 border-b border-gray-300 bg-gray-50 px-3 py-2 dark:bg-white/5">
                <input
                  type="checkbox"
                  checked={all}
                  ref={(el) => {
                    if (el) el.indeterminate = some && !all;
                  }}
                  onChange={(e) => onSelect(ids, e.target.checked)}
                />
                <span className="font-semibold">{group.year}</span>
                <span className="text-xs text-gray-500">
                  {ids.filter((id) => selected.has(id)).length} of {ids.length} selected
                </span>
              </label>
              <ul>
                {group.events.map((event) => {
                  const on = selected.has(event.id);
                  const countedDivisions = counted(event);
                  const isOpen = open.has(event.id);
                  return (
                    <li key={event.id} className="border-b border-gray-200 last:border-b-0">
                      <div className="flex items-center gap-3 px-3 py-1.5 text-sm">
                        <input type="checkbox" checked={on} onChange={(e) => onSelect([event.id], e.target.checked)} aria-label={`Count ${event.name}`} />
                        <span className="w-24 shrink-0 tabular-nums text-gray-600">{event.startDate}</span>
                        <button type="button" onClick={() => toggleOpen(event.id)} className="min-w-0 flex-1 cursor-pointer truncate text-left hover:underline" aria-expanded={isOpen}>
                          {event.name}
                        </button>
                        <span className="shrink-0 text-xs text-gray-500">
                          {countedDivisions.length === 0
                            ? 'no counted divisions'
                            : `${countedDivisions.length} of ${event.divisions.length} divisions`}
                        </span>
                      </div>
                      {isOpen && (
                        <ul className="mb-2 ml-11 mr-3 flex flex-col gap-1 text-sm">
                          {event.divisions.map((division) => {
                            const open_ = divisionCounts(division.name, 'open', params);
                            const women_ = divisionCounts(division.name, 'women', params);
                            const counts = open_ || women_;
                            return (
                              <li key={division.id} className={`flex items-center gap-3 ${counts ? '' : 'text-gray-400'}`}>
                                <input
                                  type="checkbox"
                                  disabled={!counts}
                                  checked={counts && !excluded.has(division.id)}
                                  onChange={(e) => onExclude(division.id, !e.target.checked)}
                                  aria-label={`Count ${division.name}`}
                                />
                                <span className="flex-1">{division.name || '(no name)'}</span>
                                <span className="text-xs">{division.teams} teams</span>
                                <span className="w-32 text-right text-xs">{open_ ? 'open + women' : women_ ? 'women only' : 'not counted'}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        {years.length === 0 && <p className="text-sm text-gray-500">No events match.</p>}
      </div>
    </div>
  );
}
