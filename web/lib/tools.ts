import type { Dictionary } from './i18n/dictionaries';
import { PERMISSIONS, type PermissionKey } from './permissions';

// Each tool's name and description are in the dictionaries (lib/i18n/*/tools.ts), under
// the tool's key.
export type ToolKey = PermissionKey | 'permissions' | 'settings' | 'backups' | 'public_api' | 'profile' | 'activity' | 'judging_trainer';
type ToolInfo = { key: ToolKey; href: string };

// TypeScript enforces an entry here for every key in PERMISSIONS.
const TOOL_HREF: Record<PermissionKey, string> = {
  player_editor: '/players',
  data_bridge: '/data-bridge',
  event_creator: '/events',
  event_editor: '/event-editor',
  head_judge: '/head-judge',
  event_music: '/event-music',
  pool_review: '/pool-review',
  rankings_generator: '/rankings-generator',
  results_parser: '/results-parser',
  event_registration: '/event-registration',
};

export const FLAGGED_TOOLS: ToolInfo[] = PERMISSIONS.map((p) => ({ key: p.key, href: TOOL_HREF[p.key] }));

// Not permission-flag-gated (the Permissions Editor is intentionally
// admin-only, not assignable via a group) — shown only when access.isAdmin.
export const ADMIN_ONLY_TOOLS: ToolInfo[] = [
  { key: 'permissions', href: '/permissions' },
  { key: 'settings', href: '/settings' },
  { key: 'backups', href: '/backups' },
  { key: 'public_api', href: '/public-api' },
];

// Available to any logged-in user regardless of permissions/admin status.
export const ALWAYS_AVAILABLE_TOOLS: ToolInfo[] = [
  { key: 'profile', href: '/profile' },
  { key: 'activity', href: '/activity' },
  { key: 'judging_trainer', href: '/judging-trainer' },
];

// The browser tab title for a tool's pages: its name in the Control Panel.
export function toolTitle(t: Dictionary, href: string): string {
  const tool = [...FLAGGED_TOOLS, ...ADMIN_ONLY_TOOLS, ...ALWAYS_AVAILABLE_TOOLS].find((x) => x.href === href);
  if (!tool) throw new Error(`No tool at ${href}`);
  return t.tools[tool.key].label;
}
