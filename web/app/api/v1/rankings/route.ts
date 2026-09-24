import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getRateLimitConfig } from '@/lib/rate-limit-settings';
import { getClientIp } from '@/lib/request-ip';
import { listRankings } from '@/lib/rankings-queries';

function rateLimitHeaders(rl: { limit: number; remaining: number; reset: number }) {
  return {
    'X-RateLimit-Limit': String(rl.limit),
    'X-RateLimit-Remaining': String(rl.remaining),
    'X-RateLimit-Reset': String(rl.reset),
    'Access-Control-Allow-Origin': '*',
  };
}

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const config = await getRateLimitConfig();
  const rl = await checkRateLimit(`${ip}:rankings`, config);

  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests — slow down and try again shortly.' },
      {
        status: 429,
        headers: {
          ...rateLimitHeaders(rl),
          'Retry-After': String(Math.max(0, rl.reset - Math.floor(Date.now() / 1000))),
        },
      }
    );
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  if (!category) {
    return NextResponse.json(
      { error: 'Missing required query param: category' },
      { status: 400, headers: rateLimitHeaders(rl) }
    );
  }

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const country = searchParams.get('country') ?? undefined;

  const data = await listRankings({ category, page, country });

  return NextResponse.json(
    { category, page: data.page, totalPages: data.totalPages, results: data.results },
    { headers: rateLimitHeaders(rl) }
  );
}
