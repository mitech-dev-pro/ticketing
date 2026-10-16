// Shared guard for every app/api/cron/* route. Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>` automatically once the project has
// CRON_SECRET set; anything else is rejected.

import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';

export function requireCronSecret(request: NextRequest): NextResponse | null {
  const header = request.headers.get('authorization');
  if (header !== `Bearer ${env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  return null;
}
