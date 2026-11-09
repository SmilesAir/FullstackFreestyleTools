import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { signOut } from '@/auth';
import { getCurrentUserAccess } from '@/lib/authz';
import { HOME_PATH } from '@/lib/site';
import { pool } from '@/lib/db';
import { getPoolReviewScope, hasPoolReviewAccess } from '@/lib/pool-review-queries';
import { FLAGGED_TOOLS, ADMIN_ONLY_TOOLS, ALWAYS_AVAILABLE_TOOLS } from '@/lib/tools';
import { getT } from '@/lib/i18n/server';
import { LanguageSwitch } from '@/app/_components/LanguageSwitch';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT()).common.controlPanel };
}

export default async function ControlPanelPage() {
  const access = await getCurrentUserAccess();
  if (!access) redirect('/login');

  // Pool Review also shows for an event's committee and a division's directors.
  const autoPoolReview = hasPoolReviewAccess(await getPoolReviewScope(access));
  const tools = [
    ...ALWAYS_AVAILABLE_TOOLS,
    ...FLAGGED_TOOLS.filter(
      (t) => access.isAdmin || access.permissions.has(t.key) || (t.key === 'pool_review' && autoPoolReview)
    ),
    ...(access.isAdmin ? ADMIN_ONLY_TOOLS : []),
  ];

  // The Profile card calls out an account with no player linked yet.
  const linked = await pool.query<{ player_id: string | null }>('SELECT player_id FROM users WHERE id = $1', [access.userId]);
  const noLinkedPlayer = !linked.rows[0]?.player_id;
  const t = await getT();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.common.controlPanel}</h1>
        <div className="flex items-center gap-4">
          <LanguageSwitch inline />
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: HOME_PATH });
            }}
          >
            <button type="submit" className="cursor-pointer text-sm text-gray-500 underline">
              {t.common.signOut}
            </button>
          </form>
        </div>
      </div>

      {tools.length === 0 && (
        <p className="text-sm text-gray-500">
          {t.home.noToolsYet}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="rounded border border-gray-300 p-4 hover:bg-gray-50"
          >
            <div className="font-medium text-blue-600">{t.tools[tool.key].label}</div>
            <p className="mt-1 text-sm text-gray-600">{t.tools[tool.key].description}</p>
            {tool.href === '/profile' && noLinkedPlayer && (
              <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {t.home.noLinkedPlayerWarning}
              </p>
            )}
          </Link>
        ))}
      </div>
    </main>
  );
}
