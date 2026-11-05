import { listBackups } from '@/lib/backup-queries';
import { getBackupSchedule, MAX_BACKUP_INTERVAL_DAYS, MIN_BACKUP_INTERVAL_DAYS } from '@/lib/backup-schedule';
import { BackupScheduleForm } from './_components/BackupScheduleForm';
import { CreateBackupButton } from './_components/CreateBackupButton';
import { UploadBackupForm } from './_components/UploadBackupForm';
import { RestoreButton } from './_components/RestoreButton';
import { DeleteBackupButton } from './_components/DeleteBackupButton';
import { getLocale, getT } from '@/lib/i18n/server';
import { formatDateTime } from '@/lib/i18n/format';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}



export default async function BackupsPage() {
  const [backups, schedule, t, locale] = await Promise.all([listBackups(), getBackupSchedule(), getT(), getLocale()]);
  const KIND_LABEL: Record<string, string> = t.admin.kind;

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">{t.tools.backups.label}</h1>
      <p className="text-sm text-gray-600">
        {t.admin.backupsIntro(schedule.intervalDays)}
      </p>

      <BackupScheduleForm
        intervalDays={schedule.intervalDays}
        min={MIN_BACKUP_INTERVAL_DAYS}
        max={MAX_BACKUP_INTERVAL_DAYS}
        lastAutomaticAt={schedule.lastAutomaticAt?.toISOString() ?? null}
        nextDueAt={schedule.nextDueAt?.toISOString() ?? null}
      />

      <div className="flex flex-col gap-4 sm:flex-row">
        <CreateBackupButton />
        <UploadBackupForm />
      </div>

      <div className="flex flex-col gap-2">
        {backups.length === 0 && <p className="text-sm text-gray-500">{t.admin.noBackups}</p>}
        {backups.map((b) => (
          <div key={b.id} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{formatDateTime(locale, b.created_at)}</div>
                <div className="text-xs text-gray-500">
                  {formatBytes(Number(b.size_bytes))} · {KIND_LABEL[b.kind] ?? b.kind} · {b.filename}
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/api/backups/${b.id}/download`}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  {t.admin.download}
                </a>
                <RestoreButton backupId={b.id} filename={b.filename} />
                <DeleteBackupButton backupId={b.id} filename={b.filename} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
