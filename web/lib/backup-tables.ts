// Every table a full backup covers, parents before children per schema.sql's
// FK graph. Restore deletes in reverse (children first) and inserts in this
// order (parents first) so foreign keys never break mid-restore.
//
// api_rate_limits (pure ephemeral counters) and backups (recursive) are
// deliberately excluded.
export const BACKUP_TABLES = [
  'players',
  'events',
  'divisions',
  'teams',
  'team_players',
  'pool_judges',
  'rankings',
  'ranking_points',
  'users',
  'permission_groups',
  'group_permissions',
  'user_permission_groups',
  'app_settings',
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];

// Tables added after backups already existed. A backup made before the table
// existed is still restorable: it is read as having no rows, so restoring it
// clears the table, which is what the database held at that point in time.
export const TABLES_ADDED_LATER: readonly BackupTableName[] = ['pool_judges'];
