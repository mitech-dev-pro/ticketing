// Shared helpers for session and auth tokens: a high-entropy random value is
// handed to the user (cookie, email link); only its SHA-256 digest is stored,
// so a leaked database can never be turned back into a usable token.

import { createHash, randomBytes } from 'node:crypto';

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
