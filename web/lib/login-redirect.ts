// Where to go after signing in. The proxy sends a signed-out visitor to /login?callbackUrl=<the
// full URL they asked for>; only its path, query and hash are kept, so the result is always a
// page on this site (never an open redirect), and /login itself is dropped to avoid a loop.
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  let url: URL;
  try {
    url = new URL(raw, 'http://local');
  } catch {
    return null;
  }
  if (url.pathname === '/login' || url.pathname.startsWith('/api/')) return null;
  const path = `${url.pathname}${url.search}${url.hash}`;
  return path.startsWith('/') && !path.startsWith('//') ? path : null;
}
