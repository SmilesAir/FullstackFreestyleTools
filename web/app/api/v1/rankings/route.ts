import { NextResponse } from 'next/server';
import { applyRateLimit, preflight } from '@/lib/points-api';
import { listRankings } from '@/lib/rankings-queries';

export const OPTIONS = preflight;

export async function GET(request: Request) {
  // The same limits as the points API: a burst limit and a daily limit per IP, and a monthly ceiling.
  const limited = await applyRateLimit(request, 'rankings');
  if (!limited.ok) return limited.response;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  if (!category) {
    return NextResponse.json({ error: 'Missing required query param: category' }, { status: 400, headers: limited.headers });
  }

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const country = searchParams.get('country') ?? undefined;

  const data = await listRankings({ category, page, country });

  return NextResponse.json(
    { category, page: data.page, totalPages: data.totalPages, results: data.results },
    { headers: limited.headers }
  );
}
