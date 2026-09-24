'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { restoreBackupAction } from '@/lib/backup-actions';

export function RestoreButton({ backupId, filename }: { backupId: string; filename: string }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      >
        Restore
      </button>
    );
  }

  function onConfirm() {
    startTransition(async () => {
      const result = await restoreBackupAction(backupId);
      setError(result.error);
      if (!result.error) {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-red-300 bg-red-50 p-2">
      <p className="text-xs text-red-800">
        This replaces ALL current data with &quot;{filename}&quot;, including logins and permissions. A safety
        snapshot of the current state is taken first. Type <strong>RESTORE</strong> to confirm.
      </p>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        className="rounded border border-gray-300 px-2 py-1 text-sm"
        placeholder="RESTORE"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmText !== 'RESTORE' || pending}
          className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Restoring…' : 'Confirm restore'}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmText('');
            setError(null);
          }}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
