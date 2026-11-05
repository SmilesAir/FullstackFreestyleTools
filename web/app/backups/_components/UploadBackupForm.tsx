'use client';

import { useActionState } from 'react';
import { uploadBackupAction, type ActionState } from '@/lib/backup-actions';
import { useT } from '@/lib/i18n/client';

export function UploadBackupForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(uploadBackupAction, { error: null });
  const t = useT();

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
      <div className="font-medium">{t.admin.uploadBackup}</div>
      <input
        name="file"
        type="file"
        accept=".gz,application/gzip"
        required
        className="text-sm"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
      >
        {pending ? t.admin.uploading : t.admin.upload}
      </button>
    </form>
  );
}
