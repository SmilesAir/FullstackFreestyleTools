import { createPlayer } from '@/lib/players-actions';
import { PlayerForm } from '../_components/PlayerForm';
import { getT } from '@/lib/i18n/server';

export default async function NewPlayerPage() {
  const t = await getT();
  return (
    <main className="max-w-lg">
      <h1 className="mb-6 text-xl font-semibold">{t.players.newPlayer}</h1>
      <PlayerForm action={createPlayer} submitLabel={t.players.createPlayer} />
    </main>
  );
}
