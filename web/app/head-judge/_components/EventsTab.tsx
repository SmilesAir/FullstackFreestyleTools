import Link from 'next/link';
import type { EventListItem } from '@/lib/event-creator-queries';

// Picking an event opens its Pools tab.
export function EventsTab({ events, selectedId }: { events: EventListItem[]; selectedId: string | null }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">Recent events</h2>
      {events.length === 0 && <p className="text-sm text-gray-500">No events yet.</p>}
      {events.map((e) => (
        <Link
          key={e.id}
          href={`/head-judge?event=${e.id}&tab=pools`}
          className={`rounded border p-3 hover:bg-gray-50 ${e.id === selectedId ? 'border-black bg-gray-50' : 'border-gray-300'}`}
        >
          <div className="font-medium text-blue-600">{e.event_name}</div>
          <div className="text-xs text-gray-500">
            {e.start_date} → {e.end_date} · {e.division_count} division(s) · {e.player_count} player(s)
          </div>
        </Link>
      ))}
    </section>
  );
}
