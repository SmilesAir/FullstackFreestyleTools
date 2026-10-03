'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PERMISSIONS } from '@/lib/permissions';
import type { PermissionGroup } from '@/lib/permissions-queries';
import { createGroup, updateGroup, deleteGroup, type ActionState } from '@/lib/permissions-actions';
import { useRefreshOnSuccess } from '../../_components/useRefreshOnSuccess';

function PermissionCheckboxes({ defaultChecked }: { defaultChecked: string[] }) {
  return (
    <div className="flex flex-wrap gap-3">
      {PERMISSIONS.map((p) => (
        <label key={p.key} className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            name="permission_keys"
            value={p.key}
            defaultChecked={defaultChecked.includes(p.key)}
          />
          {p.label}
        </label>
      ))}
    </div>
  );
}

function NewGroupForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createGroup, { error: null });
  // On success: refresh the list, and remount the form (via key) for a fresh, empty one -
  // not just a refreshed group list with the just-typed name left sitting in the input.
  const [formKey, setFormKey] = useState(0);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      router.refresh();
      setFormKey((k) => k + 1);
    }
    wasPending.current = pending;
  }, [pending, state.error, router]);

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
      <input
        name="name"
        placeholder="Group name"
        required
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <PermissionCheckboxes defaultChecked={[]} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create group'}
      </button>
    </form>
  );
}

function GroupRow({ group }: { group: PermissionGroup }) {
  const router = useRouter();
  const boundUpdate = (prevState: ActionState, formData: FormData) => updateGroup(group.id, prevState, formData);
  const [state, formAction, pending] = useActionState(boundUpdate, { error: null });
  useRefreshOnSuccess(state.error, pending);

  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function onDelete() {
    if (!confirm(`Delete group "${group.name}"? Any users assigned to it will lose those permissions.`)) return;
    setDeleteError(null);
    startDelete(async () => {
      try {
        await deleteGroup(group.id);
        router.refresh();
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Failed to delete the group');
      }
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
      <input
        name="name"
        defaultValue={group.name}
        required
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <PermissionCheckboxes defaultChecked={group.permission_keys} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-red-600 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </form>
  );
}

export function GroupsSection({ groups }: { groups: PermissionGroup[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Permission groups</h2>
      {groups.map((g) => (
        <GroupRow key={g.id} group={g} />
      ))}
      <NewGroupForm />
    </section>
  );
}
