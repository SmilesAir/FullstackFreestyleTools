import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/auth';
import { getProfileData } from '@/lib/profile-queries';
import { getActivityDetails, getPlayerActivityPage } from '@/lib/player-activity-queries';
import { toolTitle } from '@/lib/tools';
import { ActivityEntryCard } from './_components/ActivityEntryCard';
import { Pagination } from './_components/Pagination';

export const metadata: Metadata = { title: toolTitle('/activity') };

export default async function PlayerActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [profile, { page: pageParam }] = await Promise.all([getProfileData(session.user.id), searchParams]);
  if (!profile) redirect('/login');

  const player = profile.player;
  const activity = player ? await getPlayerActivityPage(player.id, Number(pageParam ?? 1)) : null;
  const details = player && activity ? await getActivityDetails(activity.entries, player.id) : [];

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <Link href="/control-panel" className="inline-block self-start text-sm text-blue-600 underline">
        ← Control panel
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Player Activity</h1>
        {player && (
          <p className="mt-1 text-sm text-gray-600">
            {player.first_name} {player.last_name}
            {activity && activity.total > 0 && ` · ${activity.total} pool${activity.total === 1 ? '' : 's'}`}
          </p>
        )}
      </div>

      {!player ? (
        <p className="text-sm text-gray-600">
          No player is linked to your account.{' '}
          <Link href="/profile" className="text-blue-600 underline">
            Link your player on your Profile
          </Link>{' '}
          to see your activity.
        </p>
      ) : !activity || activity.total === 0 ? (
        <p className="text-sm text-gray-600">No pools yet: you haven&apos;t played in or judged any.</p>
      ) : (
        <>
          <Pagination page={activity.page} pageCount={activity.pageCount} />
          <ol className="flex flex-col gap-4">
            {activity.entries.map((entry, i) => (
              <ActivityEntryCard key={`${entry.divisionId}:${entry.roundNumber}:${entry.poolId}`} entry={entry} detail={details[i]} />
            ))}
          </ol>
          <Pagination page={activity.page} pageCount={activity.pageCount} />
        </>
      )}
    </main>
  );
}
