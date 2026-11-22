import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signOut } from '@/auth';
import { getCurrentUserAccess } from '@/lib/authz';
import { HOME_PATH } from '@/lib/site';
import { pool } from '@/lib/db';
import { getPoolReviewScope, hasPoolReviewAccess } from '@/lib/pool-review-queries';
import { FLAGGED_TOOLS, ADMIN_ONLY_TOOLS, ALWAYS_AVAILABLE_TOOLS } from '@/lib/tools';
import { getT } from '@/lib/i18n/server';
import { LanguageSwitch } from '@/app/_components/LanguageSwitch';
import { ToolGrid } from './_components/ToolGrid';

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
  // Starred tools come first; a database without the column yet just has none.
  let user: { player_id: string | null; starred_tools?: string[] } | undefined;
  try {
    const r = await pool.query<{ player_id: string | null; starred_tools: string[] }>(
      'SELECT player_id, starred_tools FROM users WHERE id = $1',
      [access.userId]
    );
    user = r.rows[0];
  } catch {
    const r = await pool.query<{ player_id: string | null }>('SELECT player_id FROM users WHERE id = $1', [access.userId]);
    user = r.rows[0];
  }
  const noLinkedPlayer = !user?.player_id;
  const starred = user?.starred_tools ?? [];
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

      {tools.length === 0 ? (
        <p className="text-sm text-gray-500">
          {t.home.noToolsYet}
        </p>
      ) : (
        <ToolGrid tools={tools} noLinkedPlayer={noLinkedPlayer} starred={starred} />
      )}
    </main>
  );
}
