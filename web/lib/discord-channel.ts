// A Discord channel's id from a pasted channel link
// ("https://discord.com/channels/<server>/<channel>", as "Copy Link" gives) or
// the bare id; null for anything else. Kept apart from discord.ts (which needs
// the database) so it can be checked on its own.
export function parseChannelInput(input: string): string | null {
  const text = input.trim();
  const link = text.match(/discord(?:app)?\.com\/channels\/(?:\d+|@me)\/(\d{15,25})/i);
  if (link) return link[1];
  return /^\d{15,25}$/.test(text) ? text : null;
}
