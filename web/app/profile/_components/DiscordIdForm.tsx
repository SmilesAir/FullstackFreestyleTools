'use client';

import { useActionState } from 'react';
import { setDiscordId } from '@/lib/profile-actions';

export function DiscordIdForm({ initialValue }: { initialValue: string | null }) {
  const [state, formAction, pending] = useActionState(setDiscordId, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <p className="text-xs text-gray-500">
        In Discord: User Settings → Advanced → enable Developer Mode. Then right-click your
        username anywhere and choose <span className="font-medium">Copy User ID</span>.
      </p>
      <input
        name="discord_id"
        defaultValue={initialValue ?? ''}
        placeholder="Discord user ID"
        className="rounded border border-gray-300 px-3 py-2"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
