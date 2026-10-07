'use client';

import { useCallback, useRef, useState } from 'react';
import { getEventDetail } from '@/lib/event-editor-actions';
import type { CalendarEvent, EventEditorDetail } from '@/lib/event-editor-queries';
import { Calendar } from './Calendar';
import { DetailPanel } from './DetailPanel';
import { EventList } from './EventList';

// Owns the one shared "what's selected" state and wires the three panes
// together: clicking a list row or a calendar pill does the same thing
// (select + scroll the other pane + briefly pulse + update the URL);
// scrolling the list only moves the calendar's visible window, never
// selects. See the Event Editor plan for the full sync design.
export function EventEditorShell({
  initialEvents,
  initialEventId,
  initialDetail,
}: {
  initialEvents: CalendarEvent[];
  initialEventId: string | null;
  initialDetail: EventEditorDetail | null;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [selectedId, setSelectedId] = useState<string | null>(initialEventId);
  const [detail, setDetail] = useState<EventEditorDetail | null>(initialDetail);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [pulsingId, setPulsingId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; token: number } | null>(
    initialEventId ? { id: initialEventId, token: 0 } : null
  );
  const [trackedMonth, setTrackedMonth] = useState<string | null>(null);

  const detailCache = useRef(new Map<string, EventEditorDetail | null>());
  const programmaticScroll = useRef(false);
  const focusToken = useRef(1);

  const select = useCallback(async (id: string) => {
    programmaticScroll.current = true;
    setSelectedId(id);
    setFocusRequest({ id, token: focusToken.current++ });
    window.history.replaceState(null, '', `/event-editor?event=${id}`);
    setPulsingId(id);
    setTimeout(() => setPulsingId((current) => (current === id ? null : current)), 1600);

    const cached = detailCache.current.get(id);
    if (cached !== undefined) {
      setDetail(cached);
    } else {
      setLoadingDetail(true);
      const result = await getEventDetail(id);
      detailCache.current.set(id, result);
      setDetail(result);
      setLoadingDetail(false);
    }
    // The scroll-into-view calls this triggers are instant (behavior: 'auto'),
    // not animated, so a short settle window is plenty before re-arming the
    // list's own scroll-tracking listener.
    setTimeout(() => {
      programmaticScroll.current = false;
    }, 500);
  }, []);

  const onFlagsChanged = useCallback((eventId: string, patch: { is_test?: boolean; is_hidden?: boolean }) => {
    setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, ...patch } : e)));
    setDetail((prev) => (prev && prev.id === eventId ? { ...prev, ...patch } : prev));
    const cached = detailCache.current.get(eventId);
    if (cached) detailCache.current.set(eventId, { ...cached, ...patch });
  }, []);

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-1 gap-4 lg:grid-cols-[320px_1fr_360px]">
      <div className="min-h-0">
        <EventList
          events={events}
          selectedId={selectedId}
          pulsingId={pulsingId}
          programmaticScroll={programmaticScroll}
          onSelect={select}
          onTrackMonth={setTrackedMonth}
        />
      </div>
      <div className="min-h-0 overflow-hidden rounded border border-gray-200">
        <Calendar events={events} pulsingId={pulsingId} focusRequest={focusRequest} trackedMonth={trackedMonth} onSelect={select} />
      </div>
      <div className="min-h-0 overflow-y-auto rounded border border-gray-200 p-4">
        <DetailPanel detail={detail} loading={loadingDetail} onFlagsChanged={onFlagsChanged} />
      </div>
    </div>
  );
}
