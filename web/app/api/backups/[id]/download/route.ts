import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/authz';
import { getBackupWithUrl } from '@/lib/backup-queries';
import { fetchBackupBuffer } from '@/lib/backup';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();

  const { id } = await params;
  const backup = await getBackupWithUrl(id);
  if (!backup) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });

  const buffer = await fetchBackupBuffer(backup.blob_url);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': `attachment; filename="${backup.filename}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
