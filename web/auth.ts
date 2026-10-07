import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import Discord from 'next-auth/providers/discord';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';
import { pool } from './lib/db';
import { connectLogin, isOAuthProvider, resolveOAuthUser, takeConnectIntent } from './lib/auth-logins';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Profile's "Connect" starts a Google/Discord sign-in to attach it to the signed-in
    // account (lib/auth-logins.ts). If that sign-in already opens a different account it
    // is refused, and the person lands back on Profile still signed in as before.
    async signIn({ account, user }) {
      if (!account || !isOAuthProvider(account.provider)) return true;
      const connectTo = await takeConnectIntent(account.provider);
      if (!connectTo) return true;
      const facts = {
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        email: user.email ?? null,
        name: user.name ?? null,
      };
      return (await connectLogin(connectTo, facts)) === 'ok' ? true : '/profile?connect=taken';
    },
    async jwt({ token, user, account }) {
      if (user && account && isOAuthProvider(account.provider)) {
        // Google/Discord: the account this sign-in is connected to, else the one with its
        // email, else a new one (lib/auth-logins.ts).
        token.sub = await resolveOAuthUser({
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          email: user.email ?? null,
          name: user.name ?? null,
        });
      } else if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== 'string' || typeof password !== 'string') return null;

        const result = await pool.query<{ id: string; email: string; password_hash: string | null }>(
          'SELECT id, email, password_hash FROM users WHERE email = $1',
          [email]
        );
        const user = result.rows[0];
        if (!user || !user.password_hash) return null;

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return null;

        return { id: user.id, email: user.email };
      },
    }),
    Google,
    // Discord now sends an RFC 9207 `iss` parameter on the OAuth redirect, and Auth.js
    // validates it against the provider's `issuer` - which next-auth's built-in Discord
    // provider leaves unset, so every callback failed ("unexpected iss", expected the
    // library's own placeholder domain). https://github.com/nextauthjs/next-auth/issues/12208
    Discord({ issuer: 'https://discord.com' }),
  ],
});
