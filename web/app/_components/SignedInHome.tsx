import Link from 'next/link';
import { ActivityEntryCard } from '@/app/activity/_components/ActivityEntryCard';
import { MyTeamsTable } from '@/app/activity/_components/MyTeamsTable';
import { getActiveEvents } from '@/lib/active-events-queries';
import { getSimpleRankingEventIds } from '@/lib/judging-queries';
import { getActiveEventActivity, getActivityDetails } from '@/lib/player-activity-queries';
import { getProfileData } from '@/lib/profile-queries';
import { getMyTeams } from '@/lib/team-timecalls';
import { formatDayRange } from '@/lib/i18n/format';
import { getLocale, getT } from '@/lib/i18n/server';
import { PoolGrid } from './PoolGrid';

// The home page's signed-in sections: events running now with all their pools,
// then the signed-in player's own pools in those events.
export async function SignedInHome({ userId }: { userId: string }) {
  const [events, profile, simpleRankingEvents] = await Promise.all([
    getActiveEvents(),
    getProfileData(userId),
    getSimpleRankingEventIds(),
  ]);
  // Events whose Simple Ranking judge screen is open (turned on, with a Simple Ranking division).
  const simpleRanking = new Set(simpleRankingEvents.map((e) => e.event_id));
  const player = profile?.player ?? null;
  const [entries, myTeams] = player
    ? await Promise.all([getActiveEventActivity(player.id), getMyTeams(player.id)])
    : [[], []];
  const details = player ? await getActivityDetails(entries, player.id) : [];
  const [t, locale] = await Promise.all([getT(), getLocale()]);

  return (
    <>
      {!player && (
        // ?welcome=1 makes Profile flash its Linked player section.
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t.home.notLinkedBefore}{' '}
          <Link href="/profile?welcome=1" className="font-medium underline">
            {t.home.notLinkedLink}
          </Link>{' '}
          {t.home.notLinkedAfter}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.home.activeEvents}</h2>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">{t.home.noActiveEvents}</p>
        ) : (
          events.map((event) => (
            <div key={event.eventId} className="flex flex-col gap-3 rounded border border-gray-300 p-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {event.eventName}
                  {event.isTest && (
                    <span className="ml-2 rounded bg-purple-50 px-2 py-0.5 align-middle text-xs font-normal text-purple-800">
                      {t.common.test}
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-500">{formatDayRange(locale, event.startDate, event.endDate)}</p>
              </div>
              <PoolGrid divisions={event.divisions} />
              {simpleRanking.has(event.eventId) && (
                // Anonymous: anyone with the link can rank, no assigned seat.
                <Link
                  href={`/judge/simple-ranking/${event.eventId}`}
                  className="flex min-h-16 flex-col items-center justify-center rounded-lg border border-gray-300 px-3 py-2 text-center hover:bg-gray-50 sm:w-1/2"
                >
                  <span className="text-lg font-semibold">{t.home.judge}</span>
                  <span className="text-sm text-gray-500">{t.home.simpleRanking}</span>
                </Link>
              )}
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">{t.home.myActivity}</h2>
          {player && (
            <Link href="/activity" className="text-sm text-blue-600 underline">
              {t.home.allActivity}
            </Link>
          )}
        </div>
        {!player ? (
          <p className="text-sm text-gray-500">
            <Link href="/profile" className="text-blue-600 underline">
              {t.home.linkYourPlayer}
            </Link>{' '}
            {t.home.linkYourPlayerAfter}
          </p>
        ) : (
          <MyTeamsTable teams={myTeams} nested />
        )}
        {!player ? null : entries.length === 0 ? (
          <p className="text-sm text-gray-500">{t.home.notInActiveEvent}</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {entries.map((entry, i) => (
              <ActivityEntryCard key={`${entry.divisionId}:${entry.roundNumber}:${entry.poolId}`} entry={entry} detail={details[i]} />
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
