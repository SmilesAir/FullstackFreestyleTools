'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  addMonths,
  currentMonthKey,
  eventsByDate as buildEventsByDate,
  initialMonthWindow,
  monthKeyOfDateString,
  type MonthKey,
} from '@/lib/event-editor-dates';
import type { CalendarEvent } from '@/lib/event-editor-queries';
import { MonthGrid } from './MonthGrid';

const MAX_WINDOW = 36;
const EXTEND_BY = 3;
// Beyond this many months' gap, re-center the window on the target instead of
// filling every month in between (a distant jump, e.g. an old event, shouldn't
// render hundreds of months).
const MAX_FILL = 12;

// Every month from `from` to `to` inclusive, in order. Plain 'YYYY-MM' string
// comparison works here since both are always zero-padded the same length.
function monthsBetweenInclusive(from: MonthKey, to: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  let cursor = from;
  for (let i = 0; i < 600 && cursor <= to; i++) {
    months.push(cursor);
    if (cursor === to) break;
    cursor = addMonths(cursor, 1);
  }
  return months;
}

function extendTo(prev: MonthKey[], target: MonthKey): MonthKey[] {
  if (prev.includes(target)) return prev;
  if (target < prev[0]) {
    const fill = monthsBetweenInclusive(target, prev[0]);
    if (fill.length > MAX_FILL) return initialMonthWindow(target);
    return [...fill.slice(0, -1), ...prev];
  }
  const fill = monthsBetweenInclusive(prev[prev.length - 1], target);
  if (fill.length > MAX_FILL) return initialMonthWindow(target);
  return [...prev, ...fill.slice(1)];
}

export function Calendar({
  events,
  pulsingId,
  focusRequest,
  trackedMonth,
  onSelect,
}: {
  events: CalendarEvent[];
  pulsingId: string | null;
  // An explicit "go to this event" request (a list/calendar click) - jumps straight there.
  focusRequest: { id: string; token: number } | null;
  // List-scroll-driven window tracking - moves the visible window only, no selection.
  trackedMonth: MonthKey | null;
  onSelect: (id: string) => void;
}) {
  const [months, setMonths] = useState<MonthKey[]>(() => initialMonthWindow(currentMonthKey()));
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const prependCapture = useRef<number | null>(null);

  const eventsByDate = useMemo(() => buildEventsByDate(events), [events]);

  function prependMonths(n: number) {
    if (containerRef.current) prependCapture.current = containerRef.current.scrollHeight;
    setMonths((prev) => {
      const extra: MonthKey[] = [];
      let cursor = prev[0];
      for (let i = 0; i < n; i++) {
        cursor = addMonths(cursor, -1);
        extra.unshift(cursor);
      }
      return [...extra, ...prev].slice(0, MAX_WINDOW);
    });
  }

  function appendMonths(n: number) {
    setMonths((prev) => {
      const extra: MonthKey[] = [];
      let cursor = prev[prev.length - 1];
      for (let i = 0; i < n; i++) {
        cursor = addMonths(cursor, 1);
        extra.push(cursor);
      }
      const next = [...prev, ...extra];
      return next.length > MAX_WINDOW ? next.slice(next.length - MAX_WINDOW) : next;
    });
  }

  // Compensates for content added above the viewport so organic
  // infinite-scroll-upward never visibly jumps. No-ops unless a prepend was
  // just captured (appends and focus-jump re-centers don't set this).
  useLayoutEffect(() => {
    if (prependCapture.current === null || !containerRef.current) return;
    const before = prependCapture.current;
    prependCapture.current = null;
    const after = containerRef.current.scrollHeight;
    containerRef.current.scrollTop += after - before;
  }, [months]);

  // Infinite scroll in both directions. The sentinels are fixed DOM nodes
  // (rendered once, not per-month), so this only needs to attach on mount.
  useEffect(() => {
    const topEl = topSentinelRef.current;
    const bottomEl = bottomSentinelRef.current;
    const root = containerRef.current;
    if (!topEl || !bottomEl || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (entry.target === topEl) prependMonths(EXTEND_BY);
          else if (entry.target === bottomEl) appendMonths(EXTEND_BY);
        }
      },
      { root, rootMargin: '400px 0px' }
    );
    observer.observe(topEl);
    observer.observe(bottomEl);
    return () => observer.disconnect();
  }, []);

  // An explicit selection: extend the window if needed, then jump straight
  // there - a jump is exactly what's wanted, no scroll-position compensation.
  // The window-extend is deferred a tick (setMonths must not run synchronously
  // within the effect body) so it lands as its own follow-up update; the
  // effect then re-runs once `months` includes the target and just scrolls.
  useEffect(() => {
    if (!focusRequest) return;
    const event = events.find((e) => e.id === focusRequest.id);
    if (!event) return;
    const target = monthKeyOfDateString(event.start_date);
    if (!months.includes(target)) {
      const id = setTimeout(() => setMonths((prev) => extendTo(prev, target)), 0);
      return () => clearTimeout(id);
    }
    document.getElementById(`ee-day-${event.start_date}`)?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [focusRequest, months, events]);

  // List-scroll-driven window tracking: move the window, nothing else - no
  // selection, no URL change, so it never fights an explicit click.
  useEffect(() => {
    if (!trackedMonth) return;
    if (!months.includes(trackedMonth)) {
      const id = setTimeout(() => setMonths((prev) => extendTo(prev, trackedMonth)), 0);
      return () => clearTimeout(id);
    }
    document.getElementById(`ee-month-${trackedMonth}`)?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [trackedMonth, months]);

  return (
    <div ref={containerRef} className="h-full overflow-y-auto">
      <div ref={topSentinelRef} className="h-px" />
      {months.map((key) => (
        <MonthGrid key={key} monthKey={key} eventsByDate={eventsByDate} pulsingId={pulsingId} onSelect={onSelect} />
      ))}
      <div ref={bottomSentinelRef} className="h-px" />
    </div>
  );
}
