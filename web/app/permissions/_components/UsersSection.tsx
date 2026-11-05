'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import type { PermissionGroup, UserAccess } from '@/lib/permissions-queries';
import { createUser, setUserAccess, type ActionState } from '@/lib/permissions-actions';
import { isPlaceholderEmail } from '@/lib/oauth-placeholder';
import { useRefreshOnSuccess } from '../../_components/useRefreshOnSuccess';
import { useT } from '@/lib/i18n/client';
import type { Dictionary } from '@/lib/i18n/dictionaries';

// What to show for this account: its email, unless that's the placeholder synthesized for
// a Discord sign-in with no email of its own (lib/oauth-placeholder.ts) - then its Discord
// username if we have one, or a plain fallback label.
function userLabel(t: Dictionary, user: UserAccess): string {
  if (!isPlaceholderEmail(user.email)) return user.email;
  return user.discord_username ? t.admin.discordNoEmail(user.discord_username) : t.admin.discordSignIn;
}

function NewUserForm() {
  const [state, formAction, pending] = useActionState(createUser, { error: null });
  const t = useT();
  // On success: refresh the list, and remount the form (via key) for a fresh, empty one.
  const [formKey, setFormKey] = useState(0);
  const wasPending = useRef(false);
  useRefreshOnSuccess(state.error, pending);
  useEffect(() => {
    if (wasPending.current && !pending && !state.error) setFormKey((k) => k + 1);
    wasPending.current = pending;
  }, [pending, state.error]);

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
      <input
        name="email"
        type="email"
        placeholder={t.admin.email}
        required
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      <input
        name="password"
        type="password"
        placeholder={t.admin.tempPassword}
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
        {pending ? t.admin.creating : t.admin.createUser}
      </button>
    </form>
  );
}

function UserRow({ user, groups }: { user: UserAccess; groups: PermissionGroup[] }) {
  const t = useT();
  const boundUpdate = (prevState: ActionState, formData: FormData) => setUserAccess(user.id, prevState, formData);
  const [state, formAction, pending] = useActionState(boundUpdate, { error: null });
  useRefreshOnSuccess(state.error, pending);

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
      <div className="font-medium">{userLabel(t, user)}</div>

      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" name="is_admin" defaultChecked={user.is_admin} />
        {t.admin.adminAccess}
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
        {pending ? t.common.saving : t.common.save}
      </button>
    </form>
  );
}

export function UsersSection({ users, groups }: { users: UserAccess[]; groups: PermissionGroup[] }) {
  const t = useT();
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const filtered = query
    ? users.filter((u) => userLabel(t, u).toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
    : users;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{t.admin.users}</h2>
      <NewUserForm />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t.admin.searchUsers}
        className="rounded border border-gray-300 px-3 py-2 text-sm"
      />
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">{t.admin.noUsersMatch(search)}</p>
      ) : (
        filtered.map((u) => <UserRow key={u.id} user={u} groups={groups} />)
      )}
    </section>
  );
}
