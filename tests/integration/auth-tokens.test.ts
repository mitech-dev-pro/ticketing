// Invite/reset tokens (lib/auth/tokens.ts): only a hash is stored, expiry and single-use
// are enforced by the `consumeAuthToken` update guard, not by the caller.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { createAuthToken, consumeAuthToken } from '@/lib/auth/tokens';

let userId: string;

beforeAll(async () => {
  const department = await prisma.department.create({
    data: {
      slug: 'auth-tokens-test',
      name: 'Auth Tokens Test',
      hue: 200,
      emailAlias: 'auth-tokens-test@milife.test',
    },
  });
  const user = await prisma.user.create({
    data: {
      name: 'Token Test User',
      email: 'token-test-user@milife.test',
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
  await prisma.department.delete({ where: { slug: 'auth-tokens-test' } });
});

describe('auth tokens', () => {
  it('consumes a freshly created token and returns the owning user id', async () => {
    const token = await createAuthToken(userId, 'RESET');
    await expect(consumeAuthToken(token, 'RESET')).resolves.toBe(userId);
  });

  it('is single use: a second consumption of the same token fails', async () => {
    const token = await createAuthToken(userId, 'RESET');
    await expect(consumeAuthToken(token, 'RESET')).resolves.toBe(userId);
    await expect(consumeAuthToken(token, 'RESET')).resolves.toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await createAuthToken(userId, 'RESET');
    await prisma.authToken.updateMany({
      where: { userId, type: 'RESET', usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(consumeAuthToken(token, 'RESET')).resolves.toBeNull();
  });

  it('rejects a token consumed as the wrong type', async () => {
    const token = await createAuthToken(userId, 'INVITE');
    await expect(consumeAuthToken(token, 'RESET')).resolves.toBeNull();
    await expect(consumeAuthToken(token, 'INVITE')).resolves.toBe(userId);
  });

  it('rejects an unknown token', async () => {
    await expect(consumeAuthToken('not-a-real-token', 'RESET')).resolves.toBeNull();
  });
});
