import { listGroups, listUsers } from '@/lib/permissions-queries';
import { GroupsSection } from './_components/GroupsSection';
import { UsersSection } from './_components/UsersSection';

export default async function PermissionsPage() {
  const [groups, users] = await Promise.all([listGroups(), listUsers()]);

  return (
    <main className="flex flex-col gap-10">
      <h1 className="text-xl font-semibold">Permissions</h1>
      <UsersSection users={users} groups={groups} />
      <GroupsSection groups={groups} />
    </main>
  );
}
