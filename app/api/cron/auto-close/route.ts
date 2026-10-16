// Every minute (vercel.json): closes a resolved ticket nobody rated or reopened
// within rules.autoCloseResolvedAfterDays. "Rated" is Ticket.csat != null; "reopened"
// is a REOPENED TicketEvent existing — reopen() always writes one (lib/services/tickets.ts).

import { NextResponse, type NextRequest } from 'next/server';
import { requireCronSecret } from '@/lib/cron';
import { getRuleSettings } from '@/lib/settings';
import { autoClose, findAutoCloseCandidates } from '@/lib/services/tickets';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireCronSecret(request);
  if (unauthorized) return unauthorized;

  const ruleSettings = await getRuleSettings();
  if (!ruleSettings.autoCloseEnabled) {
    return NextResponse.json({ ok: true, closed: 0, skipped: 'disabled' });
  }

  const now = new Date();
  const cutoff = new Date(
    now.getTime() - ruleSettings.autoCloseResolvedAfterDays * 24 * 60 * 60 * 1000,
  );
  const candidates = await findAutoCloseCandidates(cutoff);

  for (const ticketNumber of candidates) {
    await autoClose({ ticketNumber });
  }

  return NextResponse.json({ ok: true, closed: candidates.length });
}
