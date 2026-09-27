import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { seatPath } from '@/lib/judging';
import { getJudgingEvents } from '@/lib/judging-queries';

export default async function Home() {
  const [session, judgingEvents] = await Promise.all([auth(), getJudgingEvents()]);

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-semibold">Fullstack Freestyle Tools</h1>
        {session?.user ? (
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/control-panel" className="text-blue-600 underline">
              Control panel
            </Link>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/' });
              }}
            >
              <button type="submit" className="cursor-pointer text-gray-500 underline">
                Sign out
              </button>
            </form>
          </nav>
        ) : (
          <Link href="/login" className="text-sm text-blue-600 underline">
            Log in
          </Link>
        )}
      </header>

      {judgingEvents.length > 0 && (
        <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-8">
          {judgingEvents.map((event) => (
            <section key={event.eventId} className="flex flex-col gap-3">
              <h2 className="text-center text-sm font-medium text-gray-600">{event.eventName}</h2>
              <div className="grid grid-cols-2 gap-3">
                {event.judges.map((judge) => (
                  <Link
                    key={`${judge.playerId}-${judge.category.type}`}
                    // The seat, not the person: a device that opens it keeps
                    // following this place when the pool changes.
                    href={seatPath(judge.category, event.eventId, judge.seat)}
                    className="flex min-h-16 flex-col items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-center hover:bg-gray-50"
                  >
                    <span className="text-lg font-semibold">{judge.name}</span>
                    <span className="text-sm text-gray-500">{judge.category.label}</span>
                  </Link>
                ))}
                {event.simpleRanking && (
                  // Anonymous: anyone with the link can rank, no assigned seat.
                  <Link
                    href={`/judge/simple-ranking/${event.eventId}`}
                    className="flex min-h-16 flex-col items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-center hover:bg-gray-50"
                  >
                    <span className="text-lg font-semibold">Judge</span>
                    <span className="text-sm text-gray-500">Simple Ranking</span>
                  </Link>
                )}
              </div>
            </section>
          ))}
        </main>
      )}
    </>
  );
}
