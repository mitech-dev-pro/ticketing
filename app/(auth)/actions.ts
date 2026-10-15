'use server';

// Sign-in and sign-out Server Actions. Errors are deliberately generic ("Incorrect
// email or password") so a failed attempt never reveals whether the email exists —
// the one exception is an active lockout, which is surfaced so a legitimate user
// knows to wait rather than keep retrying and extending their own lockout.

import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { sendPasswordResetEmail } from '@/lib/email';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSession, destroySession, revokeAllSessionsForUser } from '@/lib/auth/session';
import { createAuthToken, consumeAuthToken } from '@/lib/auth/tokens';
import { isLockedOut, recordFailedLogin, clearFailedLogins } from '@/lib/auth/rate-limit';
import {
  signInSchema,
  requestPasswordResetSchema,
  setPasswordSchema,
  type SignInInput,
  type RequestPasswordResetInput,
  type SetPasswordInput,
} from '@/lib/validation/auth';
import { formError, type ActionResult } from '@/lib/validation/action-result';

const CREDENTIALS_ERROR = 'Incorrect email or password.';
const LOCKED_OUT_ERROR = 'Too many failed attempts. Try again in 15 minutes.';
const INVALID_RESET_LINK_ERROR = 'This link is invalid or has expired.';
const REQUEST_RESET_CONFIRMATION = "If that email has an account, we've sent a reset link.";

export async function signIn(input: SignInInput): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !user.active) {
    return formError(CREDENTIALS_ERROR);
  }

  if (isLockedOut(user)) {
    return formError(LOCKED_OUT_ERROR);
  }

  const passwordValid = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!passwordValid) {
    await recordFailedLogin(user.id);
    return formError(CREDENTIALS_ERROR);
  }

  await clearFailedLogins(user.id);
  await createSession(user.id);

  return { ok: true, data: { redirectTo: '/' } };
}

export async function signOut(): Promise<ActionResult<{ redirectTo: string }>> {
  await destroySession();
  return { ok: true, data: { redirectTo: '/sign-in' } };
}

export async function requestPasswordReset(
  input: RequestPasswordResetInput,
): Promise<ActionResult<{ message: string }>> {
  const parsed = requestPasswordResetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (user && user.active) {
    const token = await createAuthToken(user.id, 'RESET');
    const resetUrl = `${env.APP_URL}/set-password?token=${token}&type=RESET`;
    await sendPasswordResetEmail(user.email, resetUrl);
  }

  // Always return the same confirmation, whether or not the account exists.
  return { ok: true, data: { message: REQUEST_RESET_CONFIRMATION } };
}

export async function setPassword(
  input: SetPasswordInput,
): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const userId = await consumeAuthToken(parsed.data.token, parsed.data.type);
  if (!userId) {
    return formError(INVALID_RESET_LINK_ERROR);
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await revokeAllSessionsForUser(userId);
  await clearFailedLogins(userId);

  return { ok: true, data: { redirectTo: '/sign-in' } };
}
