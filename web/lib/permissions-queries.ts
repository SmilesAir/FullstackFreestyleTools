import 'server-only';
import { pool } from './db';

export type PermissionGroup = {
  id: string;
  name: string;
  permission_keys: string[];
};

export type UserAccess = {
  id: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  group_ids: string[];
};

export async function listGroups(): Promise<PermissionGroup[]> {
  const result = await pool.query<PermissionGroup>(
    `SELECT pg.id, pg.name,
       COALESCE(array_agg(gp.permission_key) FILTER (WHERE gp.permission_key IS NOT NULL), '{}') AS permission_keys
     FROM permission_groups pg
     LEFT JOIN group_permissions gp ON gp.group_id = pg.id
     GROUP BY pg.id, pg.name
     ORDER BY pg.name`
  );
  return result.rows;
}

export async function listUsers(): Promise<UserAccess[]> {
  const result = await pool.query<UserAccess>(
    `SELECT u.id, u.email, u.is_admin, u.created_at,
       COALESCE(array_agg(upg.group_id) FILTER (WHERE upg.group_id IS NOT NULL), '{}') AS group_ids
     FROM users u
     LEFT JOIN user_permission_groups upg ON upg.user_id = u.id
     GROUP BY u.id, u.email, u.is_admin, u.created_at
     ORDER BY u.email`
  );
  return result.rows;
}
