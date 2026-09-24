import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPlayer } from '@/lib/players-queries';
import { updatePlayer } from '@/lib/players-actions';
import { PlayerForm } from '../_components/PlayerForm';

export default async function PlayerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await getPlayer(id);
  if (!player) notFound();

  return (
    <main className="max-w-lg">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {player.first_name} {player.last_name}
        </h1>
        <Link
          href="/players"
          aria-label="Close"
          className="rounded border border-gray-300 px-2 py-1 text-sm leading-none text-gray-600 hover:bg-gray-100"
        >
          ×
        </Link>
      </div>
      <PlayerForm action={updatePlayer.bind(null, id)} player={player} submitLabel="Save changes" />
    </main>
  );
}
