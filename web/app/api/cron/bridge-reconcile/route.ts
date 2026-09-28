import { NextResponse } from 'next/server';
import { reconcile } from '@/lib/bridge/reconcile';

// Triggered by Vercel Cron (see vercel.json), same convention as monthly-backup: Vercel
// signs cron requests with this bearer token automatically when CRON_SECRET is set.
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const summary = await reconcile({ dryRun: false });
  return NextResponse.json(summary);
}
