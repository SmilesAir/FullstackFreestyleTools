import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { seatPath } from '@/lib/judging';
import { getJudgingEvents } from '@/lib/judging-queries';
import { getT } from '@/lib/i18n/server';
import { HOME_PATH } from '@/lib/site';
import { SignedInHome } from './SignedInHome';
import { LanguageSwitch } from './LanguageSwitch';

// The app's home page. Signed out: sign-in, and every judging event's seat
// buttons. Signed in: the events running now and the user's own pools in them
// instead of the seat buttons.
export async function HomePage() {
  const session = await auth();
  const judgingEvents = session?.user ? [] : await getJudgingEvents();
  const t = await getT();

  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-gray-200 px-4 py-3">
        <h1 className="text-lg font-semibold">{t.common.siteName}</h1>
        {session?.user ? (
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/control-panel" className="text-blue-600 underline">
              {t.common.controlPanel}
            </Link>
            <LanguageSwitch inline />
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: HOME_PATH });
              }}
            >
              <button type="submit" className="cursor-pointer text-gray-500 underline">
                {t.common.signOut}
              </button>
            </form>
          </nav>
        ) : (
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="text-blue-600 underline">
              {t.common.logIn}
            </Link>
            <LanguageSwitch inline />
          </nav>
        )}
      </header>

      {(session?.user?.id || judgingEvents.length > 0) && (
        <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8">
          {session?.user?.id && <SignedInHome userId={session.user.id} />}
          {judgingEvents.map((event) => (
            <section key={event.eventId} className="mx-auto flex w-full max-w-2xl flex-col gap-3">
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
                    <span className="text-sm text-gray-500">{t.judging.category[judge.category.type]}</span>
                  </Link>
                ))}
                {event.simpleRanking && (
                  // Anonymous: anyone with the link can rank, no assigned seat.
                  <Link
                    href={`/judge/simple-ranking/${event.eventId}`}
                    className="flex min-h-16 flex-col items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-center hover:bg-gray-50"
                  >
                    <span className="text-lg font-semibold">{t.home.judge}</span>
                    <span className="text-sm text-gray-500">{t.home.simpleRanking}</span>
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
