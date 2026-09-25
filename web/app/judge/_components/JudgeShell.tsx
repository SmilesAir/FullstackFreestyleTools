import Link from 'next/link';
import type { JudgingCategory } from '@/lib/judging';

// The frame every judging screen shares: which category, who is judging, and a
// way back. The category's own controls go in `children`.
export function JudgeShell({
  category,
  name,
  children,
}: {
  category: JudgingCategory;
  name: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-4 py-6">
      <Link href="/" className="text-sm text-blue-600 underline">
        ← Back
      </Link>
      <header className="text-center">
        <div className="text-sm uppercase tracking-wide text-gray-500">Judging</div>
        <h1 className="mt-1 text-4xl font-bold">{category.label}</h1>
        <div className="mt-2 text-2xl">{name}</div>
      </header>
      {children}
    </main>
  );
}

export function NotJudging() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4 text-center">
      <h1 className="mb-2 text-xl font-semibold">You&apos;re not judging right now</h1>
      <p className="mb-6 text-sm text-gray-500">
        Go back to the main page. Your name appears there when your pool is playing.
      </p>
      <Link href="/" className="text-blue-600 underline">
        ← Back
      </Link>
    </main>
  );
}
