'use client';

import { useTransition } from 'react';
import { hidePlayer, unhidePlayer } from '@/lib/players-actions';
import { useT } from '@/lib/i18n/client';

export function HideToggleButton({ id, hidden }: { id: string; hidden: boolean }) {
  const t = useT();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (hidden) {
      startTransition(() => unhidePlayer(id));
      return;
    }
    if (confirm(t.players.hideConfirm)) {
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
      {pending ? t.common.working : hidden ? t.players.unhide : t.players.hide}
    </button>
  );
}
