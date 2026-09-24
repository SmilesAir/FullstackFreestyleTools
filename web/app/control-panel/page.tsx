import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUserAccess } from '@/lib/authz';
import { FLAGGED_TOOLS, ADMIN_ONLY_TOOLS, ALWAYS_AVAILABLE_TOOLS } from '@/lib/tools';

export default async function ControlPanelPage() {
  const access = await getCurrentUserAccess();
  if (!access) redirect('/login');

  const tools = [
    ...ALWAYS_AVAILABLE_TOOLS,
    ...FLAGGED_TOOLS.filter((t) => access.isAdmin || access.permissions.has(t.key)),
    ...(access.isAdmin ? ADMIN_ONLY_TOOLS : []),
  ];

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold">Control panel</h1>

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
          </Link>
        ))}
      </div>
    </main>
  );
}
