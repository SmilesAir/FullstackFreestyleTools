import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserAccess } from '@/lib/authz';
import { getPoolReviewScope, getReviewPools, listReviewEvents } from '@/lib/pool-review-queries';
import { ReviewPoolCard } from './_components/ReviewPoolCard';

export default async function PoolReviewPage({ searchParams }: { searchParams: Promise<{ event?: string; choose?: string }> }) {
  const { event: eventParam, choose } = await searchParams;
  const access = await getCurrentUserAccess();
  if (!access) redirect('/login');
  const scope = await getPoolReviewScope(access);
  const events = await listReviewEvents(scope);
  // Only a listed event can be chosen; the only one is chosen by itself,
  // unless the list was asked for (Change event).
  const selected =
    choose !== undefined
      ? null
      : (events.find((e) => e.id === eventParam) ?? (events.length === 1 ? events[0] : null));
  const divisions = selected ? await getReviewPools(selected.id, scope) : [];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Pool Review</h1>
        {selected && (
          <div className="mt-1 text-xs text-gray-500">
            Event: <span className="font-medium text-gray-700">{selected.name}</span>
            {selected.isTest && ' (test)'}
            {events.length > 1 && (
              <>
                {' · '}
                <Link href="/pool-review?choose" className="text-blue-600 underline">
                  Change event
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {selected ? null : events.length === 0 ? (
        <p className="text-sm text-gray-500">No upcoming events to review.</p>
      ) : (
        <>
          <nav className="flex flex-wrap gap-2" aria-label="Events">
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/pool-review?event=${e.id}`}
                className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-50"
              >
                {e.name}
                {e.isTest && <span className="ml-2 text-xs opacity-70">(test)</span>}
              </Link>
            ))}
          </nav>
          <p className="text-sm text-gray-500">Choose an event.</p>
        </>
      )}

      {selected && divisions.length === 0 && (
        <p className="text-sm text-gray-500">No pools to review: none have teams yet, or every pool is published.</p>
      )}

      {divisions.map((division) => (
        <section key={division.id} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{division.name}</h2>
          {division.rounds.map((round) => (
            <div key={round.number} className="flex flex-col gap-2">
              <h3 className="text-sm font-medium text-gray-600">{round.name}</h3>
              <ul className="flex flex-col gap-3">
                {round.pools.map((p) => (
                  <ReviewPoolCard key={p.key} pool={p} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
