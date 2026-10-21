'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { chooseHeadJudgeEvent } from '@/lib/judging-settings-actions';
import type { EventListItem } from '@/lib/event-creator-queries';

// Picking an event loads its event presets into it (undoing settings changes
// that weren't saved to them), then opens its Pools tab.
export function EventsTab({ events, selectedId }: { events: EventListItem[]; selectedId: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState<string | null>(null);

  function choose(eventId: string) {
    setChoosing(eventId);
    startTransition(async () => {
      try {
        await chooseHeadJudgeEvent(eventId);
      } catch (err) {
        console.error('Could not load the event presets', err);
      }
      router.push(`/head-judge?event=${eventId}&tab=pools`);
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Recent events</h2>
      {events.length === 0 && <p className="text-sm text-gray-500">No events yet.</p>}
      {events.map((e) => (
        <button
          key={e.id}
          type="button"
          onClick={() => choose(e.id)}
          disabled={pending}
          className={`cursor-pointer rounded border p-3 text-left hover:bg-gray-50 disabled:cursor-wait ${
            e.id === selectedId ? 'border-black bg-gray-50' : 'border-gray-300'
          }`}
        >
          <div className="font-medium text-blue-600">
            {e.event_name}
            {pending && choosing === e.id && <span className="ml-2 text-xs font-normal text-gray-500">Loading…</span>}
          </div>
          <div className="text-xs text-gray-500">
            {e.start_date} → {e.end_date} · {e.division_count} division(s) · {e.player_count} player(s)
          </div>
        </button>
      ))}
    </section>
  );
}
