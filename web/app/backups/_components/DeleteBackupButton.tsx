'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteBackupAction } from '@/lib/backup-actions';

export function DeleteBackupButton({ backupId, filename }: { backupId: string; filename: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (!confirm(`Delete backup "${filename}"? This can't be undone.`)) return;
    startTransition(async () => {
      await deleteBackupAction(backupId);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="rounded border border-gray-300 px-3 py-2 text-sm text-red-600 disabled:opacity-50"
    >
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  );
}
