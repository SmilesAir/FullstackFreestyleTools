import { PERMISSIONS, type PermissionKey } from './permissions';

type ToolInfo = { label: string; description: string; href: string };

// TypeScript enforces an entry here for every key in PERMISSIONS.
const TOOL_INFO: Record<PermissionKey, ToolInfo> = {
  player_editor: {
    label: 'Player Editor',
    description:
      'Search, create, and edit player records; hide/unhide instead of deleting; link duplicate entries via an alias picker.',
    href: '/players',
  },
  event_creator: {
    label: 'Event Creator',
    description:
      'Create events, set up divisions/rounds/pools, paste in teams (parsed by Claude), and seed rounds from rankings.',
    href: '/events',
  },
  head_judge: {
    label: 'Head Judge',
    description: 'Run an event day: see every pool with its teams and judges, choose the playing pool, and follow results.',
    href: '/head-judge',
  },
  rankings_generator: {
    label: 'Rankings Generator',
    description:
      'Choose events, tune the ranking and rating settings, preview the rankings and ratings, and publish them for the public results pages.',
    href: '/rankings-generator',
  },
  results_parser: {
    label: 'Results Parser',
    description:
      'Enter the results of events run outside this system: paste them for Claude to fill in, check the rounds, pools, places and players, then save.',
    href: '/results-parser',
  },
};

export const FLAGGED_TOOLS = PERMISSIONS.map((p) => ({ key: p.key, ...TOOL_INFO[p.key] }));

// Not permission-flag-gated (the Permissions Editor is intentionally
// admin-only, not assignable via a group) — shown only when access.isAdmin.
export const ADMIN_ONLY_TOOLS: ToolInfo[] = [
  {
    label: 'Permissions Editor',
    description: 'Create user accounts, toggle admin access, and manage permission groups.',
    href: '/permissions',
  },
  {
    label: 'Settings',
    description: 'Configure app-wide settings, including the Discord bot token.',
    href: '/settings',
  },
  {
    label: 'Backups',
    description: 'Create, download, upload, and restore full database backups.',
    href: '/backups',
  },
  {
    label: 'Data Bridge',
    description: 'Keep events in sync with the live app’s DynamoDB table: per-event toggle, manual run/dry run, and conflict resolution.',
    href: '/data-bridge',
  },
];

// Available to any logged-in user regardless of permissions/admin status.
export const ALWAYS_AVAILABLE_TOOLS: ToolInfo[] = [
  {
    label: 'Profile',
    description: 'View your account details.',
    href: '/profile',
  },
];

// The browser tab title for a tool's pages: its name in the Control Panel.
export function toolTitle(href: string): string {
  const tool = [...FLAGGED_TOOLS, ...ADMIN_ONLY_TOOLS, ...ALWAYS_AVAILABLE_TOOLS].find((t) => t.href === href);
  if (!tool) throw new Error(`No tool at ${href}`);
  return tool.label;
}
