// A Google/Discord account with no email on file still needs a unique, non-null
// `users.email` to insert against (see lib/auth-logins.ts' resolveOAuthUser). This
// generates that placeholder and recognizes it again for display - no DB access, so it's
// safe to import from client components too (app/permissions/_components/UsersSection.tsx).
export const placeholderEmail = (provider: string, providerAccountId: string) => `${provider}:${providerAccountId}@no-email.invalid`;

export const isPlaceholderEmail = (email: string) => /^[a-z]+:\d+@no-email\.invalid$/.test(email);
