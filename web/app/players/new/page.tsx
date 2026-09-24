import { createPlayer } from '@/lib/players-actions';
import { PlayerForm } from '../_components/PlayerForm';

export default function NewPlayerPage() {
  return (
    <main className="max-w-lg">
      <h1 className="mb-6 text-xl font-semibold">New player</h1>
      <PlayerForm action={createPlayer} submitLabel="Create player" />
    </main>
  );
}
