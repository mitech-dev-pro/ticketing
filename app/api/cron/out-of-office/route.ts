// Every minute (vercel.json): reassigns a departing user's open tickets to their
// delegate for as long as their OutOfOffice window is active. The Profile toggle that
// creates OutOfOffice rows is Phase 7 — this route only needs the model to exist.

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/cron';
import { reassignOpenTickets } from '@/lib/services/out-of-office';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const results = await reassignOpenTickets();
  return NextResponse.json({ ok: true, reassigned: results.length });
}
