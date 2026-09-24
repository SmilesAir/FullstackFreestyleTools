'use client';

import { useTransition } from 'react';
import { hidePlayer, unhidePlayer } from '@/lib/players-actions';

export function HideToggleButton({ id, hidden }: { id: string; hidden: boolean }) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (hidden) {
      startTransition(() => unhidePlayer(id));
      return;
    }
    if (confirm('Hide this player? They will no longer appear in search or the alias picker.')) {
      startTransition(() => hidePlayer(id));
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
    >
      {pending ? 'Working…' : hidden ? 'Unhide' : 'Hide'}
    </button>
  );
}
