export const PERMISSIONS = [
  { key: 'player_editor', label: 'Player Editor' },
  { key: 'event_creator', label: 'Event Creator' },
  { key: 'head_judge', label: 'Head Judge' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
