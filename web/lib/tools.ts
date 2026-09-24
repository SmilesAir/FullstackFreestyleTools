import { PERMISSIONS, type PermissionKey } from './permissions';

type ToolInfo = { label: string; description: string; href: string };

// TypeScript enforces an entry here for every key in PERMISSIONS.
const TOOL_INFO: Record<PermissionKey, ToolInfo> = {
  player_editor: {
    label: 'Player editor',
    description:
      'Search, create, and edit player records; hide/unhide instead of deleting; link duplicate entries via an alias picker.',
    href: '/players',
  },
  event_creator: {
    label: 'Event creator',
    description:
      'Create events, set up divisions/rounds/pools, paste in teams (parsed by Claude), and seed rounds from rankings.',
    href: '/events',
  },
};

export const FLAGGED_TOOLS = PERMISSIONS.map((p) => ({ key: p.key, ...TOOL_INFO[p.key] }));

// Not permission-flag-gated (the Permissions editor is intentionally
// admin-only, not assignable via a group) — shown only when access.isAdmin.
export const ADMIN_ONLY_TOOLS: ToolInfo[] = [
  {
    label: 'Permissions editor',
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
];

// Available to any logged-in user regardless of permissions/admin status.
export const ALWAYS_AVAILABLE_TOOLS: ToolInfo[] = [
  {
    label: 'Profile',
    description: 'View your account details.',
    href: '/profile',
  },
];
