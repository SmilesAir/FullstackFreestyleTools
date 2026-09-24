export const PERMISSIONS = [
  { key: 'player_editor', label: 'Player editor' },
  { key: 'event_creator', label: 'Event creator' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
