export type SettingDef = {
  key: string;
  label: string;
  description: string;
  type: 'text' | 'password' | 'number';
  /** Shown/used when no value has been saved yet. Only meaningful for non-password types. */
  default?: string;
};

// Extend this as more app-wide settings are needed.
export const SETTINGS: SettingDef[] = [
  {
    key: 'discord_bot_token',
    label: 'Discord bot token',
    description:
      'From the Discord Developer Portal: use the same Application as Discord login, or create one — Bot tab → Reset Token. ' +
      'This is different from the OAuth client secret used for "Sign in with Discord". ' +
      'The bot also needs to be invited to a server your users share with it (OAuth2 → URL Generator → bot scope) before it can DM them.',
    type: 'password',
  },
  {
    key: 'anthropic_api_key',
    label: 'Anthropic API key',
    description:
      'Used by the Event Creator to parse pasted teams with Claude. Create one at console.anthropic.com → API keys. Usage is billed to that account.',
    type: 'password',
  },
  {
    key: 'api_rate_limit_requests',
    label: 'Public API rate limit (requests)',
    description: 'Max requests a single IP can make to the public API per window, before getting a 429.',
    type: 'number',
    default: '30',
  },
  {
    key: 'api_rate_limit_window_seconds',
    label: 'Public API rate limit window (seconds)',
    description: 'Length of the rate-limit window in seconds, paired with the request count above.',
    type: 'number',
    default: '60',
  },
];
