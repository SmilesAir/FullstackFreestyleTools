export const PERMISSIONS = [
  { key: 'player_editor', label: 'Player editor' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
