import { getEvent, listEvents } from '@/lib/event-creator-queries';
import { getHeadJudgePools, getPlayState } from '@/lib/head-judge-queries';
import { EventsTab } from './_components/EventsTab';
import { HeadJudgeShell } from './_components/HeadJudgeShell';

const TABS = ['events', 'pools', 'play', 'results'] as const;

// Reads the server's clock when no event is chosen (there is no state to load).
const NO_EVENT = '00000000-0000-0000-0000-000000000000';

export default async function HeadJudgePage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; tab?: string }>;
}) {
  const { event: eventParam, tab: tabParam } = await searchParams;

  // Independent queries run together (each DB round trip is ~100ms).
  const [events, selected, divisions, play] = await Promise.all([
    listEvents(),
    eventParam ? getEvent(eventParam) : null,
    eventParam ? getHeadJudgePools(eventParam) : [],
    getPlayState(eventParam ?? NO_EVENT),
  ]);
  const initialTab = TABS.find((t) => t === tabParam) ?? 'events';

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Head Judge</h1>
        {selected && (
          <div className="mt-1 text-xs text-gray-500">
            Event: <span className="font-medium text-gray-700">{selected.event_name}</span>
          </div>
        )}
      </div>

      <div>
        {/* Keyed by event so choosing another event starts with a clean slate. */}
        <HeadJudgeShell
          key={selected?.id ?? 'none'}
          eventId={selected?.id ?? null}
          initialTab={initialTab}
          divisions={selected ? divisions : []}
          initialPlay={play}
          eventsContent={<EventsTab events={events} selectedId={selected?.id ?? null} />}
        />
      </div>
    </main>
  );
}
