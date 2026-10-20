'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setEventCommittee } from '@/lib/event-creator-actions';
import type { PlayerRef } from '@/lib/event-creator-queries';
import { PlayerPicker } from './PlayerPicker';

type Member = { id: string; name: string; country?: string | null };

// The event's committee: one list for the whole event, like a division's
// directors. Each add or remove is saved straight away.
export function EventCommitteeSettings({
  eventId,
  members: initialMembers,
  error: loadError,
}: {
  eventId: string;
  members: PlayerRef[];
  error: string | null;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;

  function save(next: Member[]) {
    const previous = members;
    setMembers(next);
    startTransition(async () => {
      const result = await setEventCommittee(eventId, next.map((m) => m.id));
      setError(result.error);
      if (result.error) setMembers(previous);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="text-gray-600">The people who review this event&apos;s pools and results.</p>
      {members.length === 0 && <p className="text-gray-500">No committee members yet.</p>}
      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-2">
          <span>
            {m.name}
            {m.country && <span className="ml-1 text-xs text-gray-500">{m.country}</span>}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => save(members.filter((x) => x.id !== m.id))}
            className="text-xs text-red-600 underline disabled:opacity-50"
          >
            remove
          </button>
        </div>
      ))}
      <PlayerPicker
        onPick={(p) => !pending && !members.some((m) => m.id === p.id) && save([...members, p])}
        placeholder="Add a committee member…"
      />
      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
