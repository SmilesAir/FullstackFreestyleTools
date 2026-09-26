import 'server-only';
import { getCurrentUserAccess } from './authz';

// For the /api/db routes (the proxy doesn't cover /api): null when the caller is
// a signed-in head judge (or admin), otherwise the response to send back.
export async function headJudgeGuard(): Promise<Response | null> {
  const access = await getCurrentUserAccess();
  if (!access) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (!access.isAdmin && !access.permissions.has('head_judge')) {
    return Response.json({ error: 'No access' }, { status: 403 });
  }
  return null;
}

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
