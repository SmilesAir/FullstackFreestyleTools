import Link from 'next/link';
import { getEvent, getEventPlayers, listDivisions, listEvents } from '@/lib/event-creator-queries';
import { DIVISION_NAMES } from '@/lib/event-creator';
import { NewEventForm } from './_components/NewEventForm';
import { NewDivisionForm } from './_components/NewDivisionForm';
import { EventTabs, type EventTab } from './_components/EventTabs';
import { DivisionView } from './_components/division/DivisionView';

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; division?: string }>;
}) {
  const { event: eventParam, division: divisionParam } = await searchParams;

  // Independent queries run together (each DB round trip is ~100ms).
  const [events, selected, unsortedDivisions, players] = await Promise.all([
    listEvents(),
    eventParam ? getEvent(eventParam) : null,
    eventParam ? listDivisions(eventParam) : [],
    eventParam ? getEventPlayers(eventParam) : [],
  ]);
  const divisions = selected
    ? unsortedDivisions.sort(
        (a, b) =>
          DIVISION_NAMES.indexOf(a.division_name as (typeof DIVISION_NAMES)[number]) -
          DIVISION_NAMES.indexOf(b.division_name as (typeof DIVISION_NAMES)[number])
      )
    : [];
  const existing = new Set(divisions.map((d) => d.division_name));
  const missing = DIVISION_NAMES.filter((n) => !existing.has(n));
  const eventsHref = selected ? `/events?event=${selected.id}` : '/events';

  const eventsContent = (
    <div className="flex flex-col gap-6">
      <NewEventForm />

      {selected && (
        <section className="flex flex-col gap-3 rounded border border-gray-300 p-3">
          <div>
            <div className="font-semibold">{selected.event_name}</div>
            <div className="text-xs text-gray-500">
              {selected.start_date} → {selected.end_date} · pick a division tab above to edit it
            </div>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-medium">Players ({players.length})</h3>
            {players.length === 0 ? (
              <p className="text-sm text-gray-500">No players yet — add teams in a division tab.</p>
            ) : (
              <ul className="grid max-h-80 gap-x-6 gap-y-1 overflow-y-auto text-sm sm:grid-cols-2">
                {players.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-2 border-b border-gray-100 py-0.5">
                    <span>
                      {p.name}
                      {p.country && <span className="ml-1 text-xs text-gray-500">{p.country}</span>}
                    </span>
                    <span className="text-xs text-gray-500">{p.divisions.join(', ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Recent events</h2>
        {events.length === 0 && <p className="text-sm text-gray-500">No events yet.</p>}
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/events?event=${e.id}`}
            className={`rounded border p-3 hover:bg-gray-50 ${e.id === selected?.id ? 'border-black bg-gray-50' : 'border-gray-300'}`}
          >
            <div className="font-medium text-blue-600">{e.event_name}</div>
            <div className="text-xs text-gray-500">
              {e.start_date} → {e.end_date} · {e.division_count} division(s)
            </div>
          </Link>
        ))}
      </section>
    </div>
  );

  const tabs: EventTab[] = [{ id: 'events', label: 'Events', href: eventsHref, content: eventsContent }];
  if (selected) {
    for (const d of divisions) {
      tabs.push({
        id: d.id,
        label: d.division_name,
        status: d.is_hidden ? 'draft' : 'published',
        href: `/events?event=${selected.id}&division=${d.id}`,
        content: <DivisionView eventId={selected.id} divisionId={d.id} divisionName={d.division_name} siblings={divisions} />,
      });
    }
    // Only exists while some division types are unused.
    if (missing.length > 0) {
      tabs.push({
        id: 'new',
        label: '+ New division',
        href: `/events?event=${selected.id}&division=new`,
        content: <NewDivisionForm key={missing.join()} eventId={selected.id} available={[...missing]} />,
      });
    }
  }
  const initialActive = tabs.some((t) => t.id === divisionParam) ? (divisionParam as string) : 'events';

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Event creator</h1>
        {selected && (
          <div className="mt-1 text-xs text-gray-500">
            Event: <span className="font-medium text-gray-700">{selected.event_name}</span>
          </div>
        )}
      </div>

      <div>
        <EventTabs tabs={tabs} initialActive={initialActive} />
      </div>
    </main>
  );
}
