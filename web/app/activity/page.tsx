import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/auth';
import { getProfileData } from '@/lib/profile-queries';
import { getActivityDetails, getPlayerActivityPage } from '@/lib/player-activity-queries';
import { getMyTeams } from '@/lib/team-timecalls';
import { getT } from '@/lib/i18n/server';
import { toolTitle } from '@/lib/tools';
import { ActivityEntryCard } from './_components/ActivityEntryCard';
import { MyTeamsTable } from './_components/MyTeamsTable';
import { Pagination } from './_components/Pagination';
import { ControlPanelLink } from '@/app/_components/ControlPanelLink';

export async function generateMetadata(): Promise<Metadata> {
  return { title: toolTitle(await getT(), '/activity') };
}

export default async function PlayerActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [profile, { page: pageParam }] = await Promise.all([getProfileData(session.user.id), searchParams]);
  if (!profile) redirect('/login');

  const player = profile.player;
  const [activity, myTeams] = player
    ? await Promise.all([getPlayerActivityPage(player.id, Number(pageParam ?? 1)), getMyTeams(player.id)])
    : [null, []];
  const details = player && activity ? await getActivityDetails(activity.entries, player.id) : [];
  const t = await getT();

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <ControlPanelLink label={t.common.backToControlPanel} className="self-start" linkClassName="text-sm text-blue-600 underline" />
      <div>
        <h1 className="text-xl font-semibold">{t.tools.activity.label}</h1>
        {player && (
          <p className="mt-1 text-sm text-gray-600">
            {player.first_name} {player.last_name}
            {activity && activity.total > 0 && t.activity.poolsCount(activity.total)}
          </p>
        )}
      </div>

      <MyTeamsTable teams={myTeams} />

      {!player ? (
        <p className="text-sm text-gray-600">
          {t.activity.noPlayerBefore}{' '}
          <Link href="/profile" className="text-blue-600 underline">
            {t.activity.noPlayerLink}
          </Link>{' '}
          {t.activity.noPlayerAfter}
        </p>
      ) : !activity || activity.total === 0 ? (
        <p className="text-sm text-gray-600">{t.activity.noPools}</p>
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
