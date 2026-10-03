import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '@/auth';
import { getCurrentUserAccess } from '@/lib/authz';
import { HOME_PATH } from '@/lib/site';
import { pool } from '@/lib/db';
import { FLAGGED_TOOLS, ADMIN_ONLY_TOOLS, ALWAYS_AVAILABLE_TOOLS } from '@/lib/tools';

export const metadata: Metadata = { title: 'Control Panel' };

export default async function ControlPanelPage() {
  const access = await getCurrentUserAccess();
  if (!access) redirect('/login');

  const tools = [
    ...ALWAYS_AVAILABLE_TOOLS,
    ...FLAGGED_TOOLS.filter((t) => access.isAdmin || access.permissions.has(t.key)),
    ...(access.isAdmin ? ADMIN_ONLY_TOOLS : []),
  ];

  // The Profile card calls out an account with no player linked yet.
  const linked = await pool.query<{ player_id: string | null }>('SELECT player_id FROM users WHERE id = $1', [access.userId]);
  const noLinkedPlayer = !linked.rows[0]?.player_id;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Control panel</h1>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: HOME_PATH });
          }}
        >
          <button type="submit" className="cursor-pointer text-sm text-gray-500 underline">
            Sign out
          </button>
        </form>
      </div>

      {tools.length === 0 && (
        <p className="text-sm text-gray-500">
          You don&apos;t have access to any tools yet. Ask an admin to grant you access.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="rounded border border-gray-300 p-4 hover:bg-gray-50"
          >
            <div className="font-medium text-blue-600">{tool.label}</div>
            <p className="mt-1 text-sm text-gray-600">{tool.description}</p>
            {tool.href === '/profile' && noLinkedPlayer && (
              <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                ⚠ No player linked: link your player so results, rankings and Discord tags find you.
              </p>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}
