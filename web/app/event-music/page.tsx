import Link from 'next/link';
import { getHeadJudgePools } from '@/lib/head-judge-queries';
import { getEventMusicPoll, getTeamSongs, listPlayingEvents } from '@/lib/event-music-queries';
import { EventMusicShell } from './_components/EventMusicShell';

export default async function EventMusicPage({ searchParams }: { searchParams: Promise<{ event?: string; choose?: string }> }) {
  const { event: eventParam, choose } = await searchParams;
  const events = await listPlayingEvents();
  // Only a playing event can be chosen; the only one is chosen by itself,
  // unless the list was asked for (Change event).
  const selected =
    choose !== undefined
      ? null
      : (events.find((e) => e.id === eventParam) ?? (events.length === 1 ? events[0] : null));

  const [divisions, poll] = selected
    ? await Promise.all([getHeadJudgePools(selected.id), getEventMusicPoll(selected.id)])
    : [[], null];
  const { songs, music } = selected ? await getTeamSongs(selected.id, divisions) : { songs: {}, music: {} };

  return (
    <main className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Event Music</h1>
        {/* Once chosen, the event list gives way to the event's name. */}
        {selected && (
          <div className="mt-1 text-xs text-gray-500">
            Event: <span className="font-medium text-gray-700">{selected.name}</span>
            {selected.isTest && ' (test)'}
            {events.length > 1 && (
              <>
                {' · '}
                <Link href="/event-music?choose" className="text-blue-600 underline">
                  Change event
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {selected ? null : events.length === 0 ? (
        <p className="text-sm text-gray-500">No events are playing. Turn an event on as Playing in the Event Creator.</p>
      ) : (
        <nav className="flex flex-wrap gap-2" aria-label="Playing events">
          {events.map((e) => (
            <Link
              key={e.id}
              href={`/event-music?event=${e.id}`}
              className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
            >
              {e.name}
              {e.isTest && <span className="ml-2 text-xs opacity-70">(test)</span>}
            </Link>
          ))}
        </nav>
      )}

      {events.length > 0 && !selected && <p className="text-sm text-gray-500">Choose an event.</p>}

      {selected && poll && (
        // Keyed by event so choosing another event starts with a clean slate.
        <EventMusicShell
          key={selected.id}
          eventId={selected.id}
          divisions={divisions}
          songs={songs}
          music={music}
          initialPoll={poll}
        />
      )}
    </main>
  );
}
