'use client';

import { useActionState } from 'react';
import { saveSetting, type ActionState } from '@/lib/settings-actions';
import type { SettingDef } from '@/lib/settings';

export function SettingForm({ def, currentValue }: { def: SettingDef; currentValue: string | null }) {
  const boundSave = (prevState: ActionState, formData: FormData) => saveSetting(def.key, prevState, formData);
  const [state, formAction, pending] = useActionState(boundSave, { error: null });

  // Secrets are never echoed back into the page — blank means "leave as-is".
  // Plain tunables show their live value (or documented default) so an admin
  // can see and tweak the actual number instead of guessing.
  const isSecret = def.type === 'password';

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
      <div className="font-medium">{def.label}</div>
      <p className="text-xs text-gray-500">{def.description}</p>
      <input
        name="value"
        type={def.type}
        defaultValue={isSecret ? undefined : currentValue ?? def.default ?? ''}
        placeholder={isSecret ? (currentValue ? 'Currently set — leave blank to keep it' : 'Not set') : undefined}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
