import { listGroups, listUsers } from '@/lib/permissions-queries';
import { GroupsSection } from './_components/GroupsSection';
import { UsersSection } from './_components/UsersSection';
import { getT } from '@/lib/i18n/server';

export default async function PermissionsPage() {
  const [groups, users, t] = await Promise.all([listGroups(), listUsers(), getT()]);

  return (
    <main className="flex flex-col gap-10">
      <h1 className="text-xl font-semibold">{t.admin.permissions}</h1>
      <GroupsSection groups={groups} />
      <UsersSection users={users} groups={groups} />
    </main>
  );
}
