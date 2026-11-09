import type { Metadata } from 'next';
import Link from 'next/link';
import { auth } from '@/auth';
import { HOME_PATH } from '@/lib/site';
import { getT } from '@/lib/i18n/server';
import { toolTitle } from '@/lib/tools';
import { LanguageSwitch } from '../_components/LanguageSwitch';
import { WikiMenu } from './_components/WikiMenu';

export async function generateMetadata(): Promise<Metadata> {
  return { title: toolTitle(await getT(), '/wiki') };
}

// Open to everyone, signed in or not: the head judge guide starts with getting an account.
export default async function WikiLayout({ children }: { children: React.ReactNode }) {
  const [session, t] = await Promise.all([auth().catch(() => null), getT()]);
  const signedIn = !!session?.user;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={signedIn ? '/control-panel' : HOME_PATH} className="text-blue-600 underline">
          {signedIn ? t.common.backToControlPanel : t.wiki.home}
        </Link>
        <LanguageSwitch inline />
      </div>
      <div className="flex flex-col gap-8 md:flex-row">
        <WikiMenu />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
