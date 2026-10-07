'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarEvent } from '@/lib/event-editor-queries';
import { EventListRow } from './EventListRow';

export function EventList({
  events,
  selectedId,
  pulsingId,
  programmaticScroll,
  onSelect,
  onTrackMonth,
}: {
  events: CalendarEvent[];
  selectedId: string | null;
  pulsingId: string | null;
  // Set while a *different* pane's click is driving this list's scroll (e.g.
  // a calendar pill click scrolling the matching row into view) - this list's
  // own scroll-tracking ignores scrolls while it's set, so it doesn't fight them.
  programmaticScroll: React.RefObject<boolean>;
  onSelect: (id: string) => void;
  onTrackMonth: (monthKey: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastTracked = useRef<string | null>(null);

  const sorted = useMemo(() => [...events].sort((a, b) => b.start_date.localeCompare(a.start_date)), [events]);
  const query = filter.trim().toLowerCase();
  const filtered = query ? sorted.filter((e) => e.event_name.toLowerCase().includes(query)) : sorted;

  // Scroll the selected row into view whenever selection changes (e.g. from a
  // calendar click) - the shared programmatic-scroll flag (set by the caller
  // around this) keeps onScroll below from reacting to this same scroll.
  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(`ee-list-row-${selectedId}`)?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [selectedId]);

  function onScroll() {
    if (programmaticScroll.current) return;
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const container = containerRef.current;
      if (!container) return;
      const mid = container.getBoundingClientRect().top + container.clientHeight / 2;
      let closestId: string | null = null;
      let bestDist = Infinity;
      for (const row of container.querySelectorAll<HTMLElement>('[data-row-id]')) {
        const dist = Math.abs(row.getBoundingClientRect().top - mid);
        if (dist < bestDist) {
          bestDist = dist;
          closestId = row.dataset.rowId ?? null;
        }
      }
      if (!closestId) return;
      const event = filtered.find((e) => e.id === closestId);
      if (!event) return;
      const month = event.start_date.slice(0, 7);
      if (month !== lastTracked.current) {
        lastTracked.current = month;
        onTrackMonth(month);
      }
    });
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter events by name…"
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <div ref={containerRef} onScroll={onScroll} className="flex-1 overflow-y-auto rounded border border-gray-200">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-gray-500">No events match.</p>
        ) : (
          filtered.map((e) => (
            <EventListRow
              key={e.id}
              event={e}
              selected={e.id === selectedId}
              pulsing={e.id === pulsingId}
              onClick={() => onSelect(e.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
