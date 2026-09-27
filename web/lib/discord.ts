import 'server-only';
import { pool } from './db';
import { getSetting } from './settings-queries';

type SendResult = { ok: true } | { ok: false; error: string };

const API = 'https://discord.com/api/v10';
const NOT_CONFIGURED = "Discord bot isn't configured yet. Ask an admin to set it up in Settings.";

// A call to Discord as the bot. Null when no bot token is saved.
async function discordApi(path: string, init: RequestInit = {}): Promise<Response | null> {
  const token = await getSetting('discord_bot_token');
  if (!token) return null;
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bot ${token}`);
  // A FormData body sets its own multipart content type.
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  return fetch(`${API}${path}`, { ...init, headers });
}

export async function sendDiscordDM(discordUserId: string, message: string): Promise<SendResult> {
  const channelRes = await discordApi('/users/@me/channels', {
    method: 'POST',
    body: JSON.stringify({ recipient_id: discordUserId }),
  });
  if (!channelRes) return { ok: false, error: NOT_CONFIGURED };

  if (!channelRes.ok) {
    return {
      ok: false,
      error:
        "Couldn't open a DM with that Discord account — you may need to share a server with the bot, or your Discord privacy settings may be blocking DMs from server members.",
    };
  }

  const channel = (await channelRes.json()) as { id: string };

  const messageRes = await discordApi(`/channels/${channel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: message }),
  });

  if (!messageRes?.ok) {
    return { ok: false, error: "Discord rejected the message — the bot may not have permission to DM you." };
  }

  return { ok: true };
}

// ---- An event's channel and thread --------------------------------------------------------

// Channel types the bot can keep a thread in.
const TEXT = 0;
const ANNOUNCEMENT = 5;
const FORUM = 15;
const THREAD_TYPES: Record<number, string> = { [TEXT]: 'text', [ANNOUNCEMENT]: 'announcement', [FORUM]: 'forum' };

export { parseChannelInput } from './discord-channel';

export type ChannelInfo = { id: string; name: string; serverName: string | null; kind: string };

// The channel's name and server, checking the bot can see it and keep a thread there.
export async function describeChannel(channelId: string): Promise<{ ok: true; channel: ChannelInfo } | { ok: false; error: string }> {
  const res = await discordApi(`/channels/${channelId}`);
  if (!res) return { ok: false, error: NOT_CONFIGURED };
  if (res.status === 404) return { ok: false, error: "Discord doesn't know that channel. Check the link." };
  if (res.status === 403 || res.status === 401) {
    return { ok: false, error: "The bot can't see that channel: invite it to the server and give it access to the channel." };
  }
  if (!res.ok) return { ok: false, error: `Discord error (${res.status}). Try again shortly.` };

  const channel = (await res.json()) as { id: string; name?: string; type: number; guild_id?: string };
  const kind = THREAD_TYPES[channel.type];
  if (!kind) return { ok: false, error: 'That channel type can\'t hold threads: pick a text, announcement or forum channel.' };

  let serverName: string | null = null;
  if (channel.guild_id) {
    const guild = await discordApi(`/guilds/${channel.guild_id}`);
    if (guild?.ok) serverName = ((await guild.json()) as { name?: string }).name ?? null;
  }
  return { ok: true, channel: { id: channel.id, name: channel.name ?? channel.id, serverName, kind } };
}

// The event's Discord columns (null values when not set). An error when the
// database doesn't have them yet (backend/schema.sql hasn't been re-run).
export async function getEventDiscord(
  eventId: string
): Promise<{ ok: true; eventName: string; channelId: string | null; threadId: string | null } | { ok: false; error: string }> {
  try {
    const result = await pool.query<{ event_name: string; discord_channel_id: string | null; discord_thread_id: string | null }>(
      'SELECT event_name, discord_channel_id, discord_thread_id FROM events WHERE id = $1',
      [eventId]
    );
    const row = result.rows[0];
    if (!row) return { ok: false, error: 'Event not found' };
    return { ok: true, eventName: row.event_name, channelId: row.discord_channel_id, threadId: row.discord_thread_id };
  } catch (err) {
    if ((err as { code?: string }).code === '42703') {
      return { ok: false, error: "This database doesn't have the Discord settings yet: run the new lines of backend/schema.sql on it." };
    }
    throw err;
  }
}

// What the Event Creator's Discord card shows: the saved channel and whether the
// bot can still reach it. `error` when the settings can't be read at all.
export type EventDiscordStatus = {
  error: string | null;
  channelId: string | null;
  channel: ChannelInfo | null;
  channelError: string | null;
  hasThread: boolean;
};

export async function getEventDiscordStatus(eventId: string): Promise<EventDiscordStatus> {
  const event = await getEventDiscord(eventId);
  if (!event.ok) return { error: event.error, channelId: null, channel: null, channelError: null, hasThread: false };
  if (!event.channelId) return { error: null, channelId: null, channel: null, channelError: null, hasThread: false };
  const described = await describeChannel(event.channelId).catch(() => ({ ok: false as const, error: 'Could not reach Discord.' }));
  return {
    error: null,
    channelId: event.channelId,
    channel: described.ok ? described.channel : null,
    channelError: described.ok ? null : described.error,
    hasThread: event.threadId !== null,
  };
}

export type DiscordImage = { filename: string; data: ArrayBuffer };

// Who a post may ping: the Discord users it tags (`<@id>` in the content), and
// whether its `@here` pings. Anything else in the text (roles, @everyone) never does.
export type DiscordPing = { users?: string[]; here?: boolean };

// A message body: JSON, or multipart when an image is attached. `thread` wraps
// the message as a new forum thread's first post.
function messageBody(content: string, image?: DiscordImage, ping: DiscordPing = {}, thread?: { name: string }): string | FormData {
  const message = {
    content,
    // "everyone" also covers @here; Discord accepts at most 100 users.
    allowed_mentions: { parse: ping.here ? ['everyone'] : [], users: (ping.users ?? []).slice(0, 100) },
    ...(image ? { attachments: [{ id: 0, filename: image.filename }] } : {}),
  };
  const payload = thread ? { name: thread.name, auto_archive_duration: 10080, message } : message;
  if (!image) return JSON.stringify(payload);
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', new Blob([image.data], { type: 'image/png' }), image.filename);
  return form;
}

const threadName = (eventName: string) => `${eventName} · Play orders & results`.slice(0, 100);

async function failure(res: Response, what: string): Promise<SendResult> {
  if (res.status === 403) {
    return {
      ok: false,
      error: `Discord refused to ${what}: the bot needs View Channel, Send Messages, Create Public Threads, Send Messages in Threads, Attach Files and Mention @everyone, @here and All Roles in that channel.`,
    };
  }
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return { ok: false, error: `Discord refused to ${what} (${res.status}${body?.message ? `: ${body.message}` : ''}).` };
}

// Posts to the event's thread in its channel, making the thread the first time
// (and again if it has been deleted). Discord trouble comes back as an error,
// never thrown. Does nothing but say so when the event has no channel.
// `ping`: who the post may ping (see DiscordPing); by default nobody.
export async function postToEventThread(
  eventId: string,
  content: string,
  image?: DiscordImage,
  ping: DiscordPing = {}
): Promise<SendResult> {
  const event = await getEventDiscord(eventId);
  if (!event.ok) return event;
  if (!event.channelId) return { ok: false, error: 'This event has no Discord channel set.' };

  const post = (threadId: string) =>
    discordApi(`/channels/${threadId}/messages`, { method: 'POST', body: messageBody(content, image, ping) });

  if (event.threadId) {
    const res = await post(event.threadId);
    if (!res) return { ok: false, error: NOT_CONFIGURED };
    if (res.ok) return { ok: true };
    // Anything but a missing thread is a real problem; a missing one is remade below.
    if (res.status !== 404) return failure(res, 'post to the thread');
  }

  const channel = await discordApi(`/channels/${event.channelId}`);
  if (!channel) return { ok: false, error: NOT_CONFIGURED };
  if (!channel.ok) return failure(channel, 'open the event channel');
  const { type } = (await channel.json()) as { type: number };

  // A forum thread starts with its first post; other channels get an empty
  // thread (an announcement channel's own thread type) and the post goes in it.
  const forum = type === FORUM;
  const created = await discordApi(`/channels/${event.channelId}/threads`, {
    method: 'POST',
    body: forum
      ? messageBody(content, image, ping, { name: threadName(event.eventName) })
      : JSON.stringify({ name: threadName(event.eventName), type: type === ANNOUNCEMENT ? 10 : 11, auto_archive_duration: 10080 }),
  });
  if (!created) return { ok: false, error: NOT_CONFIGURED };
  if (!created.ok) return failure(created, 'create the event thread');
  const thread = (await created.json()) as { id: string };
  await pool.query('UPDATE events SET discord_thread_id = $2 WHERE id = $1', [eventId, thread.id]);
  if (forum) return { ok: true };

  const res = await post(thread.id);
  if (!res) return { ok: false, error: NOT_CONFIGURED };
  return res.ok ? { ok: true } : failure(res, 'post to the thread');
}
