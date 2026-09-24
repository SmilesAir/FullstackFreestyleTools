import 'server-only';
import { getSetting } from './settings-queries';

type SendResult = { ok: true } | { ok: false; error: string };

export async function sendDiscordDM(discordUserId: string, message: string): Promise<SendResult> {
  const token = await getSetting('discord_bot_token');
  if (!token) {
    return { ok: false, error: "Discord bot isn't configured yet. Ask an admin to set it up in Settings." };
  }

  const channelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  if (!channelRes.ok) {
    return {
      ok: false,
      error:
        "Couldn't open a DM with that Discord account — you may need to share a server with the bot, or your Discord privacy settings may be blocking DMs from server members.",
    };
  }

  const channel = (await channelRes.json()) as { id: string };

  const messageRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: message }),
  });

  if (!messageRes.ok) {
    return { ok: false, error: "Discord rejected the message — the bot may not have permission to DM you." };
  }

  return { ok: true };
}
