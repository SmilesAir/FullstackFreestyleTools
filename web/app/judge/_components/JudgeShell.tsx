import Link from 'next/link';
import { HOME_PATH } from '@/lib/site';

// The frame every judging screen shares. The tab bar (which shows the judge's
// name) and the category's own controls go in `children`.
export function JudgeShell({ children }: { children?: React.ReactNode }) {
  return <main className="flex min-h-dvh w-full flex-col gap-2 px-2 py-3">{children}</main>;
}

export function NotJudging() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4 text-center">
      <h1 className="mb-2 text-xl font-semibold">You&apos;re not judging right now</h1>
      <p className="mb-6 text-sm text-gray-500">
        Go back to the main page. Your name appears there when your pool is playing.
      </p>
      <Link href={HOME_PATH} className="text-blue-600 underline">
        ← Back
      </Link>
    </main>
  );
}
