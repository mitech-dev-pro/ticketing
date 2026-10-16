// Outbound email via Resend (D-11: this file, lib/storage.ts and vercel.json are the
// only places allowed to know about Vercel/Resend specifics). Without RESEND_API_KEY
// (local dev, tests) emails are logged to the console instead, so invite and reset
// links can still be followed end to end.

import { Resend } from 'resend';
import { env } from '@/lib/env';
import { formatTicketId } from '@/lib/ids';
import type { NotificationKind } from '@/generated/prisma/client';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const FROM_ADDRESS = 'miLife Service Desk <servicedesk@milifeghana.com>';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  if (!resend) {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${html}`);
    return;
  }

  await resend.emails.send({ from: FROM_ADDRESS, to, subject, html });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
  await sendEmail({
    to,
    subject: 'Reset your miLife Service Desk password',
    html: `
      <p>We received a request to reset your miLife Service Desk password.</p>
      <p><a href="${resetUrl}">Set a new password</a></p>
      <p>This link expires in 1 hour and can only be used once. If you didn't request
      this, you can ignore this email.</p>
    `,
  });
}

export async function sendInviteEmail(to: string, inviteUrl: string): Promise<void> {
  await sendEmail({
    to,
    subject: "You've been added to miLife Service Desk",
    html: `
      <p>An account has been created for you on miLife Service Desk.</p>
      <p><a href="${inviteUrl}">Set your password</a> to finish setting up your account.</p>
      <p>This link expires in 7 days and can only be used once.</p>
    `,
  });
}

const NOTIFICATION_COPY: Record<NotificationKind, { label: string; body: string }> = {
  SLA_WARNING: {
    label: 'is at 75% of its deadline',
    body: 'This ticket is approaching its resolution deadline.',
  },
  FIRST_RESPONSE_MISS: {
    label: 'missed its first-response deadline',
    body: 'Nobody has replied to the requester yet, and the first-response deadline has passed.',
  },
  ESCALATED_L1: {
    label: 'escalated to level 1',
    body: 'This ticket breached its deadline and needs your acknowledgement.',
  },
  ESCALATED_L2: {
    label: 'escalated to level 2',
    body: 'This ticket is still unresolved well past its deadline and needs attention.',
  },
};

function ticketUrl(ticketNumber: number): string {
  return `${env.APP_URL}/tickets/${ticketNumber}`;
}

/** Phase 4: one email per cron-generated Notification row (lib/services/notifications.ts),
 * sent alongside it — not a substitute for the 07:30 digest below. */
export async function sendNotificationEmail(params: {
  to: string;
  kind: NotificationKind;
  ticketNumber: number;
  ticketSubject: string;
}): Promise<void> {
  const ticketId = formatTicketId(params.ticketNumber);
  const copy = NOTIFICATION_COPY[params.kind];
  await sendEmail({
    to: params.to,
    subject: `${ticketId} ${copy.label}`,
    html: `
      <p>${copy.body}</p>
      <p><a href="${ticketUrl(params.ticketNumber)}">${ticketId} — ${params.ticketSubject}</a></p>
    `,
  });
}

export interface DigestItem {
  kind: NotificationKind;
  ticketNumber: number;
  ticketSubject: string;
}

export async function sendDailyDigestEmail(to: string, items: DigestItem[]): Promise<void> {
  if (items.length === 0) return;
  const rows = items
    .map(
      (item) =>
        `<li><a href="${ticketUrl(item.ticketNumber)}">${formatTicketId(item.ticketNumber)} — ${item.ticketSubject}</a> — ${NOTIFICATION_COPY[item.kind].label}</li>`,
    )
    .join('');
  await sendEmail({
    to,
    subject: `Your miLife Service Desk digest: ${items.length} unread`,
    html: `<p>Unread notifications from the last day:</p><ul>${rows}</ul>`,
  });
}
