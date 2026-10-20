import Link from 'next/link';
import { ActivityEntryCard } from '@/app/activity/_components/ActivityEntryCard';
import { MyTeamsTable } from '@/app/activity/_components/MyTeamsTable';
import { getActiveEvents } from '@/lib/active-events-queries';
import { getActiveEventActivity, getActivityDetails } from '@/lib/player-activity-queries';
import { getProfileData } from '@/lib/profile-queries';
import { getMyTeams } from '@/lib/team-timecalls';
import { PoolGrid } from './PoolGrid';

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const dateRange = (start: string, end: string) => (start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`);

// The home page's signed-in sections: events running now with all their pools,
// then the signed-in player's own pools in those events.
export async function SignedInHome({ userId }: { userId: string }) {
  const [events, profile] = await Promise.all([getActiveEvents(), getProfileData(userId)]);
  const player = profile?.player ?? null;
  const [entries, myTeams] = player
    ? await Promise.all([getActiveEventActivity(player.id), getMyTeams(player.id)])
    : [[], []];
  const details = player ? await getActivityDetails(entries, player.id) : [];

  return (
    <>
      {!player && (
        // ?welcome=1 makes Profile flash its Linked player section.
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Your account isn&apos;t linked to a player yet. Set it under{' '}
          <Link href="/profile?welcome=1" className="font-medium underline">
            Profile → Linked player
          </Link>{' '}
          to see your pools, teams and activity here.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Active events</h2>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">No events are being played right now.</p>
        ) : (
          events.map((event) => (
            <div key={event.eventId} className="flex flex-col gap-3 rounded border border-gray-300 p-4">
              <div>
                <h3 className="text-lg font-semibold">
                  {event.eventName}
                  {event.isTest && (
                    <span className="ml-2 rounded bg-purple-50 px-2 py-0.5 align-middle text-xs font-normal text-purple-800">
                      Test
                    </span>
                  )}
                </h3>
                <p className="text-sm text-gray-500">{dateRange(event.startDate, event.endDate)}</p>
              </div>
              <PoolGrid divisions={event.divisions} />
            </div>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold">My activity</h2>
          {player && (
            <Link href="/activity" className="text-sm text-blue-600 underline">
              All activity →
            </Link>
          )}
        </div>
        {!player ? (
          <p className="text-sm text-gray-500">
            <Link href="/profile" className="text-blue-600 underline">
              Link your player
            </Link>{' '}
            to see the pools you&apos;re playing and judging.
          </p>
        ) : (
          <MyTeamsTable teams={myTeams} nested />
        )}
        {!player ? null : entries.length === 0 ? (
          <p className="text-sm text-gray-500">You&apos;re not playing or judging in any active event.</p>
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
