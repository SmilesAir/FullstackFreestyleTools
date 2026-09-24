import type { NextAuthConfig } from 'next-auth';

const PROTECTED_PREFIXES = ['/players', '/permissions', '/control-panel', '/profile', '/settings'];

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isProtected = PROTECTED_PREFIXES.some((prefix) => nextUrl.pathname.startsWith(prefix));

      if (isProtected) {
        return isLoggedIn;
      }
      return true;
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.sub!;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
