import { NextResponse } from 'next/server';
import { createBackup } from '@/lib/backup';

// Triggered by Vercel Cron (see vercel.json). Vercel signs cron requests with
// this bearer token automatically when CRON_SECRET is set — reject anything
// else so this can't be used to spam backup creation from the public internet.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await createBackup('automatic');
  return NextResponse.json({ ok: true });
}
