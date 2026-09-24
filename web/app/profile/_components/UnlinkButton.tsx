'use client';

import { useTransition } from 'react';
import { unlinkPlayer } from '@/lib/profile-actions';

export function UnlinkButton() {
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (confirm('Unlink this player from your account?')) {
      startTransition(() => unlinkPlayer());
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
    >
      {pending ? 'Working…' : 'Unlink'}
    </button>
  );
}
