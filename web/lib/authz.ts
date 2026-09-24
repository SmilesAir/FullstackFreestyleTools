import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { pool } from './db';
import { PERMISSIONS, type PermissionKey } from './permissions';

export async function getCurrentUserAccess() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { rows } = await pool.query<{ is_admin: boolean }>(
    'SELECT is_admin FROM users WHERE id = $1',
    [session.user.id]
  );
  const isAdmin = rows[0]?.is_admin ?? false;

  if (isAdmin) {
    return {
      userId: session.user.id,
      isAdmin: true,
      permissions: new Set(PERMISSIONS.map((p) => p.key)),
    };
  }

  const perms = await pool.query<{ permission_key: string }>(
    `SELECT DISTINCT gp.permission_key FROM user_permission_groups upg
     JOIN group_permissions gp ON gp.group_id = upg.group_id
     WHERE upg.user_id = $1`,
    [session.user.id]
  );

  return {
    userId: session.user.id,
    isAdmin: false,
    permissions: new Set(perms.rows.map((r) => r.permission_key)),
  };
}

export async function requirePermission(key: PermissionKey) {
  const access = await getCurrentUserAccess();
  if (!access) redirect('/login');
  if (!access.isAdmin && !access.permissions.has(key)) redirect('/no-access');
  return access;
}

export async function requireAdmin() {
  const access = await getCurrentUserAccess();
  if (!access) redirect('/login');
  if (!access.isAdmin) redirect('/no-access');
  return access;
}
