import 'server-only';
import { pool } from './db';
import { getSetting } from './settings-queries';

// How often the automatic backup runs. Vercel's schedule (web/vercel.json) calls the backup
// job once a day; the job only makes a backup when this many days have passed since the
// last automatic one, so the frequency is a setting on the Backups page, not a deploy.

export const BACKUP_INTERVAL_KEY = 'backup_interval_days';
export const DEFAULT_BACKUP_INTERVAL_DAYS = 7;
export const MIN_BACKUP_INTERVAL_DAYS = 1;
export const MAX_BACKUP_INTERVAL_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
// The daily call comes at about the same time each day, sometimes a little early: a backup
// is due this much before the full interval, so it doesn't slip to the next day.
const SLACK_MS = 2 * 60 * 60 * 1000;

export async function getBackupIntervalDays(): Promise<number> {
  const saved = Number(await getSetting(BACKUP_INTERVAL_KEY));
  return Number.isInteger(saved) && saved >= MIN_BACKUP_INTERVAL_DAYS && saved <= MAX_BACKUP_INTERVAL_DAYS
    ? saved
    : DEFAULT_BACKUP_INTERVAL_DAYS;
}

export type BackupSchedule = { intervalDays: number; lastAutomaticAt: Date | null; nextDueAt: Date | null };

// The interval, when the last automatic backup ran, and when the next one is due (null =
// the next daily call, as none has run yet).
export async function getBackupSchedule(): Promise<BackupSchedule> {
  const [intervalDays, last] = await Promise.all([
    getBackupIntervalDays(),
    pool.query<{ created_at: Date }>(`SELECT created_at FROM backups WHERE kind = 'automatic' ORDER BY created_at DESC LIMIT 1`),
  ]);
  const lastAutomaticAt = last.rows[0]?.created_at ?? null;
  return {
    intervalDays,
    lastAutomaticAt,
    nextDueAt: lastAutomaticAt ? new Date(lastAutomaticAt.getTime() + intervalDays * DAY_MS) : null,
  };
}

export function isBackupDue(schedule: BackupSchedule, now = Date.now()): boolean {
  return schedule.nextDueAt === null || now >= schedule.nextDueAt.getTime() - SLACK_MS;
}
