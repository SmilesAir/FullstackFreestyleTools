import { listBackups } from '@/lib/backup-queries';
import { CreateBackupButton } from './_components/CreateBackupButton';
import { UploadBackupForm } from './_components/UploadBackupForm';
import { RestoreButton } from './_components/RestoreButton';
import { DeleteBackupButton } from './_components/DeleteBackupButton';

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

const KIND_LABEL: Record<string, string> = {
  manual: 'Manual',
  automatic: 'Automatic',
  uploaded: 'Uploaded',
  pre_restore: 'Pre-restore snapshot',
};

export default async function BackupsPage() {
  const backups = await listBackups();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Backups</h1>
      <p className="text-sm text-gray-600">
        Full-database backups, gzipped and stored in Blob storage. An automatic backup also runs monthly once this
        app is deployed.
      </p>

      <div className="flex flex-col gap-4 sm:flex-row">
        <CreateBackupButton />
        <UploadBackupForm />
      </div>

      <div className="flex flex-col gap-2">
        {backups.length === 0 && <p className="text-sm text-gray-500">No backups yet.</p>}
        {backups.map((b) => (
          <div key={b.id} className="flex flex-col gap-2 rounded border border-gray-300 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{new Date(b.created_at).toLocaleString()}</div>
                <div className="text-xs text-gray-500">
                  {formatBytes(Number(b.size_bytes))} · {KIND_LABEL[b.kind] ?? b.kind} · {b.filename}
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={`/api/backups/${b.id}/download`}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  Download
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
