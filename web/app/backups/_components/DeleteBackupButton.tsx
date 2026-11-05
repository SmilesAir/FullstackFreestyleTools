'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteBackupAction } from '@/lib/backup-actions';
import { useT } from '@/lib/i18n/client';

export function DeleteBackupButton({ backupId, filename }: { backupId: string; filename: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (!confirm(t.admin.deleteBackupConfirm(filename))) return;
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
      {pending ? t.admin.deleting : t.common.delete}
    </button>
  );
}
