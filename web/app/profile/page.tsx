import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getProfileData } from '@/lib/profile-queries';
import { PlayerLinkPicker } from './_components/PlayerLinkPicker';
import { UnlinkButton } from './_components/UnlinkButton';
import { DiscordIdForm } from './_components/DiscordIdForm';
import { TestDmButton } from './_components/TestDmButton';
import { SignInMethods } from './_components/SignInMethods';
import { getLogins } from '@/lib/auth-logins';
import type { Metadata } from 'next';
import { toolTitle } from '@/lib/tools';

export const metadata: Metadata = { title: toolTitle('/profile') };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ connect?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const [profile, signIns, { connect }] = await Promise.all([getProfileData(session.user.id), getLogins(session.user.id), searchParams]);

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-8 px-4 py-10">
      <Link href="/control-panel" className="inline-block self-start text-sm text-blue-600 underline">
        ← Control panel
      </Link>
      <div>
        <h1 className="mb-4 text-xl font-semibold">Profile</h1>
        <p className="text-sm text-gray-600">Username: {profile.email}</p>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-gray-700">Sign-in methods</h2>
        <SignInMethods logins={signIns.logins} hasPassword={signIns.hasPassword} notice={connect ?? null} />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-gray-700">Linked player</h2>
        {profile.player ? (
          <div className="flex items-center justify-between rounded border border-gray-300 p-3">
            <span>
              {profile.player.first_name} {profile.player.last_name}
            </span>
            <UnlinkButton />
          </div>
        ) : (
          <PlayerLinkPicker />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-gray-700">Discord ID</h2>
        <DiscordIdForm initialValue={profile.discordId} />
        <TestDmButton disabled={!profile.discordId} />
      </div>
    </main>
  );
}
