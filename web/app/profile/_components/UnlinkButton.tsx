'use client';

import { useTransition } from 'react';
import { unlinkPlayer } from '@/lib/profile-actions';
import { useT } from '@/lib/i18n/client';

export function UnlinkButton() {
  const t = useT();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (confirm(t.profile.unlinkConfirm)) {
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
      {pending ? t.common.working : t.profile.unlink}
    </button>
  );
}
