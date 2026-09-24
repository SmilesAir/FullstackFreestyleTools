'use client';

import { useActionState } from 'react';
import type { PermissionGroup, UserAccess } from '@/lib/permissions-queries';
import { createUser, setUserAccess, type ActionState } from '@/lib/permissions-actions';

function NewUserForm() {
  const [state, formAction, pending] = useActionState(createUser, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
      <input
        name="email"
        type="email"
        placeholder="Email"
        required
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        name="password"
        type="password"
        placeholder="Temporary password (min 8 characters)"
        required
        minLength={8}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Creating…' : 'Create user'}
      </button>
    </form>
  );
}

function UserRow({ user, groups }: { user: UserAccess; groups: PermissionGroup[] }) {
  const boundUpdate = (prevState: ActionState, formData: FormData) => setUserAccess(user.id, prevState, formData);
  const [state, formAction, pending] = useActionState(boundUpdate, { error: null });

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
      <div className="font-medium">{user.email}</div>

      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" name="is_admin" defaultChecked={user.is_admin} />
        Admin (access to everything)
      </label>

      {groups.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {groups.map((g) => (
            <label key={g.id} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                name="group_ids"
                value={g.id}
                defaultChecked={user.group_ids.includes(g.id)}
              />
              {g.name}
            </label>
          ))}
        </div>
      )}

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

export function UsersSection({ users, groups }: { users: UserAccess[]; groups: PermissionGroup[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Users</h2>
      {users.map((u) => (
        <UserRow key={u.id} user={u} groups={groups} />
      ))}
      <NewUserForm />
    </section>
  );
}
