import { NextResponse } from 'next/server';
import { createBackup } from '@/lib/backup';
import { getBackupSchedule, isBackupDue } from '@/lib/backup-schedule';

// Triggered by Vercel Cron once a day (see vercel.json; the path keeps its old "monthly"
// name). Makes an automatic backup only when the interval set on the Backups page has
// passed since the last one (lib/backup-schedule.ts). Vercel signs cron requests with this
// bearer token automatically when CRON_SECRET is set — reject anything else so this can't
// be used to spam backup creation from the public internet.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const schedule = await getBackupSchedule();
  if (!isBackupDue(schedule)) {
    return NextResponse.json({ ok: true, skipped: true, nextDueAt: schedule.nextDueAt });
  }
  await createBackup('automatic');
  return NextResponse.json({ ok: true });
}
