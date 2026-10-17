// The groups the Settings page shows, in order.
export const SETTING_SECTIONS = [
  { id: 'discord', title: 'Discord' },
  { id: 'claude', title: 'Claude integration' },
  { id: 'support', title: 'Support chat' },
  { id: 'api', title: 'Public API' },
] as const;
export type SettingSection = (typeof SETTING_SECTIONS)[number]['id'];

export type SettingDef = {
  key: string;
  section: SettingSection;
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
    section: 'discord',
    label: 'Discord bot token',
    description:
      'From the Discord Developer Portal: use the same Application as Discord login, or create one — Bot tab → Reset Token. ' +
      'This is different from the OAuth client secret used for "Sign in with Discord". ' +
      'The bot also needs to be invited to a server your users share with it (OAuth2 → URL Generator → bot scope) before it can DM them.',
    type: 'password',
  },
  {
    key: 'public_site_url',
    section: 'discord',
    label: 'Public site address',
    description:
      "The site's public web address, used for the results links the bot posts to an event's Discord thread (\"<address>/r/<code>\").",
    type: 'text',
    default: 'https://freestylejudge.com',
  },
  {
    key: 'anthropic_api_key',
    section: 'claude',
    label: 'Anthropic API key',
    description:
      'Used to parse pasted text with Claude (the Event Creator and the Results Parser) and for the support chat on Head Judge and Event Creator. Create one at console.anthropic.com → API keys. Usage is billed to that account.',
    type: 'password',
  },
  {
    key: 'support_chat_per_user_hour',
    section: 'support',
    label: 'Questions per person per hour',
    description:
      'How many questions one person can ask the support chat (Head Judge and Event Creator) in an hour. 0 turns the chat off.',
    type: 'number',
    default: '20',
  },
  {
    key: 'support_chat_per_user_day',
    section: 'support',
    label: 'Questions per person per day',
    description: 'How many questions one person can ask in 24 hours. 0 turns the chat off.',
    type: 'number',
    default: '60',
  },
  {
    key: 'support_chat_all_users_day',
    section: 'support',
    label: 'Questions per day, everyone',
    description: 'How many questions everyone together can ask in 24 hours. 0 turns the chat off.',
    type: 'number',
    default: '300',
  },
  {
    key: 'support_chat_monthly_budget_usd',
    section: 'support',
    label: 'Monthly budget (US dollars)',
    description:
      "The chat stops for the rest of the calendar month once its estimated cost reaches this (a question costs about one to three cents). 0 turns the chat off.",
    type: 'number',
    default: '20',
  },
  {
    key: 'api_rate_limit_requests',
    section: 'api',
    label: 'Public API rate limit (requests)',
    description: 'Max requests a single IP can make to the public API per window, before getting a 429.',
    type: 'number',
    default: '30',
  },
  {
    key: 'api_rate_limit_daily_requests',
    section: 'api',
    label: 'Public API rate limit (requests per IP per day)',
    description:
      'Max requests a single IP can make to the public points API (the feed for the results pages) per day. One results-page view is about 8 requests.',
    type: 'number',
    default: '500',
  },
  {
    key: 'api_rate_limit_monthly_requests',
    section: 'api',
    label: 'Public API limit (requests per month, everyone)',
    description:
      'Ceiling on all requests to the public points API in a 30-day window, from every caller together. Normal traffic is about 3,000 a month; this stops runaway or scraping traffic.',
    type: 'number',
    default: '10000',
  },
  {
    key: 'api_rate_limit_window_seconds',
    section: 'api',
    label: 'Public API rate limit window (seconds)',
    description: 'Length of the rate-limit window in seconds, paired with the request count above.',
    type: 'number',
    default: '60',
  },
];
