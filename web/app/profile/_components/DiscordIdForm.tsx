'use client';

import { useActionState } from 'react';
import { setDiscordId } from '@/lib/profile-actions';
import { useT } from '@/lib/i18n/client';

export function DiscordIdForm({ initialValue }: { initialValue: string | null }) {
  const [state, formAction, pending] = useActionState(setDiscordId, { error: null });
  const t = useT();

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <p className="text-xs text-gray-500">
        {t.profile.discordHelpBefore} <span className="font-medium">{t.profile.discordHelpCopy}</span>.
      </p>
      <input
        name="discord_id"
        defaultValue={initialValue ?? ''}
        placeholder={t.profile.discordPlaceholder}
        className="rounded border border-gray-300 px-3 py-2"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? t.common.saving : t.common.save}
      </button>
    </form>
  );
}
