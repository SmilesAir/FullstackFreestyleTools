'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBackupAction } from '@/lib/backup-actions';
import { useT } from '@/lib/i18n/client';

export function CreateBackupButton() {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function onClick() {
    startTransition(async () => {
      const result = await createBackupAction();
      setError(result.error);
      if (!result.error) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? t.admin.creatingBackup : t.admin.createBackup}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
