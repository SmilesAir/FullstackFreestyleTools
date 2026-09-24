'use client';

import { useActionState, useEffect, useRef } from 'react';
import type { ActionState } from '@/lib/players-actions';
import type { PlayerWithAliasName } from '@/lib/players';
import { PlayerAliasPicker } from './PlayerAliasPicker';
import { HideToggleButton } from './HideToggleButton';
import { useAliasPicker } from './AliasPickerContext';

export function PlayerForm({
  action,
  player,
  submitLabel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  player?: PlayerWithAliasName | null;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const { picking, triggerRefresh } = useAliasPicker();

  // A successful save redirects server-side (no return value), so the only
  // client-visible signal is `pending` going true -> false without an error.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      triggerRefresh();
    }
    wasPending.current = pending;
  }, [pending, state.error, triggerRefresh]);

  const aliasLabel = player?.alias_first_name
    ? `${player.alias_first_name} ${player.alias_last_name}`
    : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset
        disabled={picking}
        className={`flex flex-col gap-4 ${picking ? 'pointer-events-none opacity-40' : ''}`}
      >
        {player && (
          <dl className="grid grid-cols-2 gap-2 rounded bg-gray-50 p-3 text-xs text-gray-500">
            <dt>ID</dt>
            <dd className="truncate">{player.id}</dd>
            <dt>Created</dt>
            <dd>{new Date(player.created_at).toLocaleString()}</dd>
            <dt>Last active</dt>
            <dd>{new Date(player.last_active).toLocaleString()}</dd>
          </dl>
        )}

        <label className="flex flex-col gap-1 text-sm">
          First name
          <input
            name="first_name"
            defaultValue={player?.first_name}
            required
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Last name
          <input
            name="last_name"
            defaultValue={player?.last_name}
            required
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Gender
          <select
            name="gender"
            defaultValue={player?.gender ?? ''}
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="">—</option>
            <option value="M">M</option>
            <option value="F">F</option>
            <option value="X">X</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Country
          <input
            name="country"
            defaultValue={player?.country ?? ''}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          FPA website ID
          <input
            name="fpa_website_id"
            defaultValue={player?.fpa_website_id ?? ''}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Membership
          <input
            name="membership"
            type="number"
            defaultValue={player?.membership ?? ''}
            className="rounded border border-gray-300 px-3 py-2"
          />
        </label>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        Alias of
        <PlayerAliasPicker
          initialId={player?.alias_id ?? null}
          initialLabel={aliasLabel}
          excludeId={player?.id}
        />
      </label>

      {player && (
        <div>
          <HideToggleButton id={player.id} hidden={player.hidden} />
        </div>
      )}

      <fieldset
        disabled={picking}
        className={picking ? 'pointer-events-none opacity-40' : undefined}
      >
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : submitLabel}
        </button>

        {player && (
          <p className="mt-2 text-xs text-gray-500">
            {player.linked_user_email ? (
              <>Linked account: {player.linked_user_email}</>
            ) : (
              'No user account linked to this player.'
            )}
          </p>
        )}
      </fieldset>
    </form>
  );
}
