import { listEvents } from '@/lib/event-creator-queries';
import { getOpenBridgeConflicts } from '@/lib/bridge-actions';
import { EventBridgeToggle } from './_components/EventBridgeToggle';
import { BridgeSection } from './_components/BridgeSection';

// Everything about the Dynamo bridge in one place: which events are opted in, the manual
// run/dry-run controls, and any open conflicts. getOpenBridgeConflicts is admin-only (see
// bridge-actions.ts), so this page redirects a non-admin the same way Settings/Backups do.
export default async function DataBridgePage() {
  const [events, conflicts] = await Promise.all([listEvents(), getOpenBridgeConflicts()]);

  return (
    <main className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Data Bridge</h1>
        <p className="mt-1 text-sm text-gray-500">
          Keeps events in sync with the live app&apos;s{' '}
          <code className="rounded bg-gray-100 px-1">freestyle-judge-production-dataTable</code> (DynamoDB) — setup
          (rosters, pool arrangement, judges, lock state) plus each pool&apos;s finished place/score. Off by default;
          turn an event on below once you&apos;re ready to link it.
        </p>
      </div>

      <BridgeSection initialConflicts={conflicts} />

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Events</h2>
        {events.length === 0 && <p className="text-sm text-gray-500">No events yet.</p>}
        {events.map((e) => (
          <div key={e.id} className="flex items-center justify-between gap-3 rounded border border-gray-300 p-3">
            <div className="min-w-0">
              <div className="font-medium">{e.event_name}</div>
              <div className="text-xs text-gray-500">
                {e.start_date} → {e.end_date}
              </div>
            </div>
            <EventBridgeToggle eventId={e.id} enabled={e.bridge_enabled} />
          </div>
        ))}
      </section>
    </main>
  );
}
