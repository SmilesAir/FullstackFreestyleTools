import Link from 'next/link';
import { HOME_PATH } from '@/lib/site';
import { getT } from '@/lib/i18n/server';
import { BlockBackButton } from './BlockBackButton';

// The frame every judging screen shares. The tab bar (which shows the judge's
// name) and the category's own controls go in `children`. The back button is
// blocked while it's on screen.
export function JudgeShell({ children }: { children?: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh w-full flex-col gap-2 px-2 py-3">
      <BlockBackButton />
      {children}
    </main>
  );
}

export async function NotJudging() {
  const t = await getT();
  return (
    <main className="mx-auto mt-24 max-w-sm px-4 text-center">
      <h1 className="mb-2 text-xl font-semibold">{t.judging.notJudgingTitle}</h1>
      <p className="mb-6 text-sm text-gray-500">{t.judging.notJudgingBody}</p>
      <Link href={HOME_PATH} className="text-blue-600 underline">
        {t.judging.backLink}
      </Link>
    </main>
  );
}
