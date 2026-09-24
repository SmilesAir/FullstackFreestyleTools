'use server';

import bcrypt from 'bcryptjs';
import { pool } from './db';
import { requireAdmin } from './authz';
import { isUniqueViolation } from './db-errors';

export type ActionState = { error: string | null };

export async function createGroup(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const name = String(formData.get('name') ?? '').trim();
  const permissionKeys = formData.getAll('permission_keys').map(String);
  if (!name) return { error: 'Group name is required' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ id: string }>(
      'INSERT INTO permission_groups (name) VALUES ($1) RETURNING id',
      [name]
    );
    const groupId = result.rows[0].id;
    if (permissionKeys.length > 0) {
      const values = permissionKeys.map((_, i) => `($1, $${i + 2})`).join(',');
      await client.query(
        `INSERT INTO group_permissions (group_id, permission_key) VALUES ${values}`,
        [groupId, ...permissionKeys]
      );
    }
    await client.query('COMMIT');
    return { error: null };
  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) return { error: 'A group with that name already exists' };
    return { error: err instanceof Error ? err.message : 'Failed to create group' };
  } finally {
    client.release();
  }
}

export async function updateGroup(groupId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const name = String(formData.get('name') ?? '').trim();
  const permissionKeys = formData.getAll('permission_keys').map(String);
  if (!name) return { error: 'Group name is required' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE permission_groups SET name = $1 WHERE id = $2', [name, groupId]);
    await client.query('DELETE FROM group_permissions WHERE group_id = $1', [groupId]);
    if (permissionKeys.length > 0) {
      const values = permissionKeys.map((_, i) => `($1, $${i + 2})`).join(',');
      await client.query(
        `INSERT INTO group_permissions (group_id, permission_key) VALUES ${values}`,
        [groupId, ...permissionKeys]
      );
    }
    await client.query('COMMIT');
    return { error: null };
  } catch (err) {
    await client.query('ROLLBACK');
    if (isUniqueViolation(err)) return { error: 'A group with that name already exists' };
    return { error: err instanceof Error ? err.message : 'Failed to update group' };
  } finally {
    client.release();
  }
}

export async function deleteGroup(groupId: string) {
  await requireAdmin();
  await pool.query('DELETE FROM permission_groups WHERE id = $1', [groupId]);
}

export async function createUser(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email) return { error: 'Email is required' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters' };

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [email, passwordHash]);
    return { error: null };
  } catch (err) {
    if (isUniqueViolation(err)) return { error: 'A user with that email already exists' };
    return { error: err instanceof Error ? err.message : 'Failed to create user' };
  }
}

export async function setUserAccess(
  userId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const isAdmin = formData.get('is_admin') === 'on';
  const groupIds = formData.getAll('group_ids').map(String);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query<{ is_admin: boolean }>(
      'SELECT is_admin FROM users WHERE id = $1',
      [userId]
    );
    const wasAdmin = current.rows[0]?.is_admin ?? false;

    if (wasAdmin && !isAdmin) {
      const others = await client.query<{ count: string }>(
        'SELECT count(*) FROM users WHERE is_admin = true AND id != $1',
        [userId]
      );
      if (Number(others.rows[0].count) === 0) {
        await client.query('ROLLBACK');
        return { error: "Can't remove the last admin" };
      }
    }

    await client.query('UPDATE users SET is_admin = $1 WHERE id = $2', [isAdmin, userId]);
    await client.query('DELETE FROM user_permission_groups WHERE user_id = $1', [userId]);
    if (groupIds.length > 0) {
      const values = groupIds.map((_, i) => `($1, $${i + 2})`).join(',');
      await client.query(
        `INSERT INTO user_permission_groups (user_id, group_id) VALUES ${values}`,
        [userId, ...groupIds]
      );
    }

    await client.query('COMMIT');
    return { error: null };
  } catch (err) {
    await client.query('ROLLBACK');
    return { error: err instanceof Error ? err.message : 'Failed to update user' };
  } finally {
    client.release();
  }
}
