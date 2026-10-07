import { getEventEditorDetail, listCalendarEvents } from '@/lib/event-editor-queries';
import { EventEditorShell } from './_components/EventEditorShell';

export default async function EventEditorPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event: eventParam } = await searchParams;
  const [events, detail] = await Promise.all([listCalendarEvents(), eventParam ? getEventEditorDetail(eventParam) : null]);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Event Editor</h1>
      <EventEditorShell initialEvents={events} initialEventId={eventParam ?? null} initialDetail={detail} />
    </main>
  );
}
