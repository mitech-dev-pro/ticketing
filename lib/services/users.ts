// Admin "Add person": creates the user row, then creates and emails an INVITE token
// (lib/auth/tokens.ts, same mechanism as password reset). The new user's passwordHash
// is a hash of a random, never-revealed token — not a known or empty value — so
// sign-in is impossible until they redeem the invite and set a real password.

import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth/password';
import { generateToken } from '@/lib/auth/crypto';
import { createAuthToken } from '@/lib/auth/tokens';
import { sendInviteEmail } from '@/lib/email';
import { env } from '@/lib/env';
import type { AddPersonInput } from '@/lib/validation/people';

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`A person with email ${email} already exists.`);
  }
}

export async function addPerson(input: AddPersonInput): Promise<{ id: string }> {
  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new DuplicateEmailError(input.email);
    }

    const placeholderPasswordHash = await hashPassword(generateToken());

    return tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: placeholderPasswordHash,
        role: input.role,
        departmentId: input.departmentId,
        branch: input.branch,
        phone: input.phone || null,
        ext: input.ext || null,
      },
    });
  });

  const token = await createAuthToken(user.id, 'INVITE');
  await sendInviteEmail(user.email, `${env.APP_URL}/set-password?token=${token}&type=INVITE`);

  return { id: user.id };
}
