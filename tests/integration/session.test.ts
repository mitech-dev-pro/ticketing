// Own database sessions (lib/auth/session.ts): the cookie only carries a random token,
// so revocation means deleting the Session row — the cookie alone must not grant access.
//
// `cookies()` is request-scoped in Next.js and unavailable outside a request, so it's
// mocked here with an in-memory jar standing in for one browser's cookie store.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieStore } = vi.hoisted(() => ({
  cookieStore: new Map<string, { value: string }>(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => cookieStore.get(name),
    set: (name: string, value: string) => {
      cookieStore.set(name, { value });
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

import { prisma } from '@/lib/db';
import { hashToken } from '@/lib/auth/crypto';
import {
  createSession,
  destroySession,
  getSession,
  revokeAllSessionsForUser,
  SESSION_COOKIE_NAME,
  touchSession,
} from '@/lib/auth/session';

let userId: string;

beforeAll(async () => {
  const department = await prisma.department.create({
    data: {
      slug: 'session-test',
      name: 'Session Test',
      hue: 210,
      emailAlias: 'session-test@milife.test',
    },
  });
  const user = await prisma.user.create({
    data: {
      name: 'Session Test User',
      email: 'session-test-user@milife.test',
      passwordHash: 'unused-in-this-test',
      role: 'MEMBER',
      departmentId: department.id,
      branch: 'ACHIMOTA_HQ',
    },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.user.delete({ where: { id: userId } });
  await prisma.department.delete({ where: { slug: 'session-test' } });
});

beforeEach(() => {
  cookieStore.clear();
});

afterEach(async () => {
  await prisma.session.deleteMany({ where: { userId } });
});

describe('sessions', () => {
  it('creates a session row and reads it back via the cookie', async () => {
    await createSession(userId);
    expect(cookieStore.has(SESSION_COOKIE_NAME)).toBe(true);

    const session = await getSession();
    expect(session?.user.id).toBe(userId);
    expect(session?.user).not.toHaveProperty('passwordHash');
  });

  it('returns null when no session cookie is set', async () => {
    await expect(getSession()).resolves.toBeNull();
  });

  it('destroySession revokes the row and clears the cookie', async () => {
    await createSession(userId);
    await destroySession();

    expect(cookieStore.has(SESSION_COOKIE_NAME)).toBe(false);
    await expect(getSession()).resolves.toBeNull();
  });

  it('revokeAllSessionsForUser invalidates a session even with its cookie still present', async () => {
    await createSession(userId);
    await revokeAllSessionsForUser(userId);

    // The cookie is still set client-side, but the row behind it is gone.
    await expect(getSession()).resolves.toBeNull();
  });

  it('touchSession slides expiry forward once inside the refresh window', async () => {
    await createSession(userId);
    const token = cookieStore.get(SESSION_COOKIE_NAME)!.value;
    const tokenHash = hashToken(token);

    const nearExpiry = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000); // 1 day left
    await prisma.session.update({ where: { tokenHash }, data: { expiresAt: nearExpiry } });

    await touchSession();

    const session = await prisma.session.findUniqueOrThrow({ where: { tokenHash } });
    expect(session.expiresAt.getTime()).toBeGreaterThan(nearExpiry.getTime());
  });

  it('touchSession leaves expiry untouched well outside the refresh window', async () => {
    await createSession(userId);
    const token = cookieStore.get(SESSION_COOKIE_NAME)!.value;
    const tokenHash = hashToken(token);

    const farExpiry = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000); // 29 days left
    await prisma.session.update({ where: { tokenHash }, data: { expiresAt: farExpiry } });

    await touchSession();

    const session = await prisma.session.findUniqueOrThrow({ where: { tokenHash } });
    expect(session.expiresAt.getTime()).toBe(farExpiry.getTime());
  });
});
