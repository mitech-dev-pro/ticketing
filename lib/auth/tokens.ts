// Invite and reset links: a random token is emailed to the user; only its hash is
// stored, `usedAt` enforces single use, `expiresAt` enforces the TTL below.

import { prisma } from '@/lib/db';
import type { AuthTokenType } from '@/generated/prisma/client';
import { generateToken, hashToken } from './crypto';

const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  INVITE: 7 * 24 * 60 * 60 * 1000,
  RESET: 60 * 60 * 1000,
};

/** Creates a token row and returns the raw token to embed in the emailed link. */
export async function createAuthToken(userId: string, type: AuthTokenType): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS[type]);

  await prisma.authToken.create({
    data: { tokenHash: hashToken(token), userId, type, expiresAt },
  });

  return token;
}

/**
 * Atomically marks a token used and returns the user id it belonged to, or null if
 * the token is unknown, already used, expired, or of the wrong type. The `updateMany`
 * guard (`usedAt: null`) is what makes two concurrent redemptions resolve to only one
 * winner.
 */
export async function consumeAuthToken(
  rawToken: string,
  type: AuthTokenType,
): Promise<string | null> {
  const tokenHash = hashToken(rawToken);

  const { count } = await prisma.authToken.updateMany({
    where: { tokenHash, type, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (count === 0) return null;

  const authToken = await prisma.authToken.findUniqueOrThrow({ where: { tokenHash } });
  return authToken.userId;
}
