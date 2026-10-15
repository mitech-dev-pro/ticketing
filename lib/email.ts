// Outbound email via Resend (D-11: this file, lib/storage.ts and vercel.json are the
// only places allowed to know about Vercel/Resend specifics). Without RESEND_API_KEY
// (local dev, tests) emails are logged to the console instead, so invite and reset
// links can still be followed end to end.

import { Resend } from 'resend';
import { env } from '@/lib/env';

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
