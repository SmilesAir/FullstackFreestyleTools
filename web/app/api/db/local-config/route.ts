import { headJudgeGuard } from '@/lib/db-guard';
import { clearLocalUrl, createLocalDatabase, saveLocalUrl, setUpLocalTables, testLocalUrl } from '@/lib/local-config';
import { getLocalUrl } from '@/lib/db-mode';

// The local database's address, set from the Head Judge page.
// Body: { action: 'test', url?: string }   try an address (or, without one, the saved/env one)
//       { action: 'save', url: string }    test, then keep it (on this computer only)
//       { action: 'clear' }                forget the saved address
//       { action: 'setup' }                create the tables in the local database
//       { action: 'create', adminPassword, adminUser?, host?, port?, database?, appUser? }
//                                          make the database and a dedicated login for the app,
//                                          set up the tables and save the address (the admin
//                                          password is used once and never kept or returned)
export async function POST(request: Request) {
  const denied = await headJudgeGuard();
  if (denied) return denied;
  // The hosted site has no local database, and nothing there may be saved to disk.
  if (process.env.VERCEL) {
    return Response.json({ ok: false, message: 'This is the hosted site. Set the local database on the laptop that runs the local server.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  try {
    switch (body?.action) {
      case 'test': {
        const target = url || getLocalUrl();
        if (!target) return Response.json({ ok: false, message: 'Enter the address first.' });
        return Response.json(await testLocalUrl(target));
      }
      case 'save':
        if (!url) return Response.json({ ok: false, message: 'Enter the address first.' });
        return Response.json(await saveLocalUrl(url));
      case 'clear':
        return Response.json(clearLocalUrl());
      case 'setup':
        return Response.json(await setUpLocalTables());
      case 'create': {
        // The admin password must not cross the network in plain http, so this is only
        // taken from the laptop itself.
        // (The Host header is what the browser typed: request.url is rewritten by Next.)
        const typed = (request.headers.get('host') ?? '').replace(/:\d+$/, '');
        if (!['localhost', '127.0.0.1', '[::1]'].includes(typed)) {
          return Response.json({ ok: false, message: 'Open this page on the laptop itself (http://localhost:3000) to create the database, so the admin password stays on this computer.' });
        }
        const text = (value: unknown, fallback: string) => (typeof value === 'string' && value.trim() ? value.trim() : fallback);
        return Response.json(
          await createLocalDatabase({
            adminPassword: typeof body.adminPassword === 'string' ? body.adminPassword : '',
            adminUser: text(body.adminUser, 'postgres'),
            host: text(body.host, 'localhost'),
            port: Number(text(body.port, '5432')),
            database: text(body.database, 'freestyle_local'),
            appUser: text(body.appUser, 'freestyle'),
          })
        );
      }
      default:
        return Response.json({ ok: false, message: 'Unknown action.' }, { status: 400 });
    }
  } catch (err) {
    return Response.json({ ok: false, message: err instanceof Error ? err.message : 'Something went wrong' }, { status: 500 });
  }
}
