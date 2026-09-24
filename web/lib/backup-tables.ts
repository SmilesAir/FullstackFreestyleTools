// Every table a full backup covers, parents before children per schema.sql's
// FK graph. Restore deletes in reverse (children first) and inserts in this
// order (parents first) so foreign keys never break mid-restore.
//
// api_rate_limits (pure ephemeral counters) and backups (recursive) are
// deliberately excluded.
export const BACKUP_TABLES = [
  'players',
  'events',
  'results',
  'result_teams',
  'result_team_players',
  'rankings',
  'ranking_points',
  'users',
  'permission_groups',
  'group_permissions',
  'user_permission_groups',
  'app_settings',
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];
