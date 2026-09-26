import 'server-only';

// The local database is on the head judge's own computer or network, so its
// address must be too: this keeps the setting from pointing the server at an
// arbitrary host.
const PRIVATE_HOST = /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|[a-z0-9-]+(\.local)?)$/i;

// null when the connection string is acceptable, otherwise what is wrong.
export function validateLocalUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return 'That is not a valid address. It looks like postgresql://user:password@localhost:5432/database';
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') return 'The address must start with postgresql://';
  const host = url.hostname;
  // A bare name (no dots) is a computer on this network; dotted names must be .local.
  const dotted = host.includes('.') && !/^\d+(\.\d+){3}$/.test(host) && !host.endsWith('.local');
  if (!host || dotted || !PRIVATE_HOST.test(host)) {
    return 'The local database must be on this computer or its local network (localhost, a 192.168.x.x / 10.x.x.x address, or a .local name).';
  }
  if (url.pathname.replace('/', '') === '') return 'Add the database name at the end, e.g. /freestyle_local';
  return null;
}

// The address without its password, for showing.
export function maskLocalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.password) url.password = '••••';
    return decodeURIComponent(url.toString());
  } catch {
    return '(unreadable address)';
  }
}
