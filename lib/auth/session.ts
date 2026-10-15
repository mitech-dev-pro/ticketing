// Own database sessions (no Auth.js): a 30-day sliding httpOnly cookie, revocable
// by deleting the Session row. `getSession()` only reads — Next.js forbids setting
// cookies during Server Component rendering — so the slide-forward happens in
// `touchSession()`, which may only be called from a Server Action or Route Handler.

import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import type { User } from '@/generated/prisma/client';
import { generateToken, hashToken } from './crypto';
import { SESSION_COOKIE_NAME } from './constants';

export { SESSION_COOKIE_NAME };
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
// Once less than this much of the session's life remains, touchSession() renews it.
const SESSION_REFRESH_WINDOW_MS = 15 * 24 * 60 * 60 * 1000;

export type SessionUser = Omit<User, 'passwordHash' | 'failedLoginCount' | 'lockedUntil'>;

function stripSensitiveFields(user: User): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId,
    branch: user.branch,
    active: user.active,
    phone: user.phone,
    ext: user.ext,
    signature: user.signature,
    theme: user.theme,
    density: user.density,
    notificationPrefs: user.notificationPrefs,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

/** Server Action only: creates the DB session row and sets the cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, cookieOptions(expiresAt));
}

/** Read-only: safe in Server Components, Server Actions and Route Handlers. */
export async function getSession(): Promise<{ user: SessionUser } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt.getTime() < Date.now() || !session.user.active) {
    return null;
  }

  return { user: stripSensitiveFields(session.user) };
}

/** Server Action / Route Handler only: reads the session and slides its expiry forward. */
export async function touchSession(): Promise<{ user: SessionUser } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session || session.expiresAt.getTime() < Date.now() || !session.user.active) {
    return null;
  }

  if (session.expiresAt.getTime() - Date.now() < SESSION_REFRESH_WINDOW_MS) {
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt } });
    cookieStore.set(SESSION_COOKIE_NAME, token, cookieOptions(expiresAt));
  }

  return { user: stripSensitiveFields(session.user) };
}

/** Server Action only: revokes the current session and clears the cookie. */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/** Revokes every session for a user (password reset, admin disables the account). */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}
