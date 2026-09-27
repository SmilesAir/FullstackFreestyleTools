import Link from 'next/link';
import { getEventPoolNav, getPublicPoolResults } from '@/lib/public-results';
import { resolveShortCode } from '@/lib/pool-shortlink';
import { PublicResultsView } from '../_components/PublicResultsView';

export const dynamic = 'force-dynamic';

function NotFound() {
  return (
    <main className="mx-auto mt-24 max-w-sm px-4 text-center">
      <h1 className="mb-2 text-xl font-semibold">Not found</h1>
      <p className="mb-6 text-sm text-gray-500">This results link doesn&apos;t point to anything — it may have been for an event that&apos;s gone.</p>
      <Link href="/" className="text-blue-600 underline">
        ← Back
      </Link>
    </main>
  );
}

export default async function PublicResultsPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const resolved = await resolveShortCode(code);
  if (!resolved) return <NotFound />;

  const letter = resolved.poolId.replace(/^pool/i, '').toUpperCase();
  const [nav, result] = await Promise.all([
    getEventPoolNav(resolved.eventId),
    getPublicPoolResults(resolved.eventId, resolved.divisionId, resolved.roundNumber, letter),
  ]);
  if (!nav || !result) return <NotFound />;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
      <PublicResultsView nav={nav} result={result} />
    </main>
  );
}
