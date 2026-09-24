import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import Discord from 'next-auth/providers/discord';
import bcrypt from 'bcryptjs';
import { authConfig } from './auth.config';
import { pool } from './lib/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account }) {
      if (user && account?.provider && account.provider !== 'credentials') {
        // OAuth sign-in: resolve or create our own users row by email
        // (merge-by-email — Google/Discord both verify email ownership).
        const email = user.email;
        if (email) {
          const existing = await pool.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [email]);
          const userId =
            existing.rows[0]?.id ??
            (
              await pool.query<{ id: string }>(
                'INSERT INTO users (email, password_hash) VALUES ($1, NULL) RETURNING id',
                [email]
              )
            ).rows[0].id;
          if (account.provider === 'discord' && account.providerAccountId) {
            await pool.query('UPDATE users SET discord_id = $1 WHERE id = $2', [
              account.providerAccountId,
              userId,
            ]);
          }
          token.sub = userId;
        }
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
    Discord,
  ],
});
