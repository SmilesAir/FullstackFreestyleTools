export const PERMISSIONS = [
  { key: 'player_editor', label: 'Player Editor' },
  { key: 'data_bridge', label: 'Data Bridge' },
  { key: 'event_creator', label: 'Event Creator' },
  { key: 'event_editor', label: 'Event Editor' },
  { key: 'head_judge', label: 'Head Judge' },
  { key: 'rankings_generator', label: 'Rankings Generator' },
  { key: 'results_parser', label: 'Results Parser' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
