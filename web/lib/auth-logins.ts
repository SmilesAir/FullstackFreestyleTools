import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { pool } from './db';
import { placeholderEmail } from './oauth-placeholder';

// Which account a Google or Discord sign-in opens, and connecting several sign-ins to one
// account (see user_logins in backend/schema.sql). A sign-in is recognised by the
// provider's permanent account id, so it keeps opening the same account whatever its
// email; the email only matters the first time, to find an existing account.

export const OAUTH_PROVIDERS = ['google', 'discord'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export const isOAuthProvider = (p: string): p is OAuthProvider => (OAUTH_PROVIDERS as readonly string[]).includes(p);

// `name` is the provider's display name (Discord's username) - available even when the
// provider gives no email, so it's the one human-readable thing we can show for an
// account stuck with a placeholder email (see recordLogin, isPlaceholderEmail).
type SignInFacts = { provider: OAuthProvider; providerAccountId: string; email: string | null; name: string | null };

async function recordLogin(userId: string, { provider, providerAccountId, email, name }: SignInFacts) {
  await pool.query(
    `INSERT INTO user_logins (provider, provider_account_id, user_id, email) VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_account_id) DO UPDATE SET email = EXCLUDED.email`,
    [provider, providerAccountId, userId, email]
  );
  // A Discord sign-in also tells the bot who to tag and DM, and refreshes the display name
  // shown for this account (handy in the Permissions list, especially without an email).
  if (provider === 'discord') {
    await pool.query('UPDATE users SET discord_id = $1, discord_username = $2 WHERE id = $3', [providerAccountId, name, userId]);
  }
}

// The account a Google/Discord sign-in opens: the one it's connected to; otherwise the one
// with the same email (and the sign-in is connected to it); otherwise a new account (with a
// placeholder email if the provider gave none - see placeholderEmail above). Always resolves
// to a real account, so every sign-in ends up visible in the Permissions user list.
export async function resolveOAuthUser(facts: SignInFacts): Promise<string> {
  const connected = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM user_logins WHERE provider = $1 AND provider_account_id = $2',
    [facts.provider, facts.providerAccountId]
  );
  let userId = connected.rows[0]?.user_id ?? null;
  if (!userId) {
    const byEmail = facts.email
      ? await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [facts.email])
      : { rows: [] as { id: string }[] };
    userId =
      byEmail.rows[0]?.id ??
      (
        await pool.query<{ id: string }>('INSERT INTO users (email, password_hash) VALUES ($1, NULL) RETURNING id', [
          facts.email ?? placeholderEmail(facts.provider, facts.providerAccountId),
        ])
      ).rows[0].id;
  }
  await recordLogin(userId, facts);
  return userId;
}

// Connects a sign-in to this account. 'taken' when it already opens a different account
// (it's never moved silently: that account could lose its only way in).
export async function connectLogin(userId: string, facts: SignInFacts): Promise<'ok' | 'taken'> {
  const existing = await pool.query<{ user_id: string }>(
    'SELECT user_id FROM user_logins WHERE provider = $1 AND provider_account_id = $2',
    [facts.provider, facts.providerAccountId]
  );
  const owner = existing.rows[0]?.user_id;
  if (owner && owner !== userId) return 'taken';
  await recordLogin(userId, facts);
  return 'ok';
}

export type ConnectedLogin = { provider: OAuthProvider; email: string | null };

export async function getLogins(userId: string): Promise<{ logins: ConnectedLogin[]; hasPassword: boolean }> {
  const [logins, user] = await Promise.all([
    pool.query<ConnectedLogin>('SELECT provider, email FROM user_logins WHERE user_id = $1 ORDER BY provider', [userId]),
    pool.query<{ has_password: boolean }>('SELECT password_hash IS NOT NULL AS has_password FROM users WHERE id = $1', [userId]),
  ]);
  return { logins: logins.rows.filter((l) => isOAuthProvider(l.provider)), hasPassword: user.rows[0]?.has_password ?? false };
}

// Disconnects a provider's sign-in(s) from this account, unless that would leave no way in.
export async function disconnectLogin(userId: string, provider: OAuthProvider): Promise<string | null> {
  const { logins, hasPassword } = await getLogins(userId);
  const others = logins.filter((l) => l.provider !== provider).length;
  if (!hasPassword && others === 0) return "That's your only way to sign in: connect another sign-in (or set a password) first.";
  await pool.query('DELETE FROM user_logins WHERE user_id = $1 AND provider = $2', [userId, provider]);
  return null;
}

// ---- The "connect" intent: a signed cookie saying "the next sign-in with this provider
// connects to this account", set by Profile's Connect button and read when the provider
// sends the person back (a top-level GET, so SameSite=Lax cookies arrive).

const INTENT_COOKIE = 'connect-sign-in';
const INTENT_SECONDS = 10 * 60;

const sign = (payload: string) => crypto.createHmac('sha256', process.env.AUTH_SECRET ?? '').update(payload).digest('base64url');

export async function setConnectIntent(userId: string, provider: OAuthProvider): Promise<void> {
  const payload = Buffer.from(JSON.stringify({ userId, provider, exp: Date.now() + INTENT_SECONDS * 1000 })).toString('base64url');
  (await cookies()).set(INTENT_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: INTENT_SECONDS,
  });
}

// The account this sign-in should be connected to, if Profile's Connect started it (and
// the cookie is genuine, unexpired and for this provider). The cookie is used up either way.
export async function takeConnectIntent(provider: OAuthProvider): Promise<string | null> {
  const store = await cookies();
  const raw = store.get(INTENT_COOKIE)?.value;
  if (!raw) return null;
  store.delete(INTENT_COOKIE);
  const [payload, mac] = raw.split('.');
  if (!payload || !mac) return null;
  const expected = sign(payload);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const intent = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { userId?: string; provider?: string; exp?: number };
    if (intent.provider !== provider || typeof intent.userId !== 'string' || !intent.exp || intent.exp < Date.now()) return null;
    return intent.userId;
  } catch {
    return null;
  }
}
