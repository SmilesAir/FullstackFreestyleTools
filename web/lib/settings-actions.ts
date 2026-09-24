'use server';

import { pool } from './db';
import Anthropic from '@anthropic-ai/sdk';
import { requireAdmin } from './authz';

export type ActionState = { error: string | null };

export async function saveSetting(key: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const value = String(formData.get('value') ?? '').trim();

  // Blank submit = "no change" (the field is left blank on reload for secret
  // settings so we never echo the value back into the page source) — never
  // silently wipes an existing value.
  if (!value) return { error: null };

  // Special-cased validation for settings where we can cheaply confirm the
  // value actually works before saving it. Extend similarly for future
  // settings that need it; most won't.
  if (key === 'discord_bot_token') {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bot ${value}` },
    });
    if (!res.ok) {
      return { error: "That doesn't look like a valid bot token — Discord rejected it." };
    }
  }

  if (key === 'anthropic_api_key') {
    try {
      await new Anthropic({ apiKey: value }).models.list({ limit: 1 });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        return { error: "That doesn't look like a valid Anthropic API key — Anthropic rejected it." };
      }
      return { error: 'Could not reach Anthropic to verify the key. Try again in a moment.' };
    }
  }

  if (key === 'api_rate_limit_requests' || key === 'api_rate_limit_window_seconds') {
    if (!/^\d+$/.test(value) || Number(value) < 1) {
      return { error: 'Must be a positive whole number.' };
    }
  }

  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value]
  );

  return { error: null };
}
