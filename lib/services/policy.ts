// Policy/claim lookup stub (BUILD_PLAN.md Phase 6). README: "Policy (lookup,
// read-only integration later)... claim number -> policy." No write path here — this
// is a placeholder for a real policy-admin integration.

import { prisma } from '@/lib/db';

export interface PolicyLookupResult {
  number: string;
  product: string;
  holder: string;
  premium: string;
  payMethod: string;
  since: string;
  matchedBy: 'policy' | 'claim';
  claimNumber: string | null;
}

export async function lookupPolicy(query: string): Promise<PolicyLookupResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const policy = await prisma.policy.findUnique({ where: { number: trimmed } });
  if (policy) return { ...policy, matchedBy: 'policy', claimNumber: null };

  const claim = await prisma.claim.findUnique({
    where: { number: trimmed },
    include: { policy: true },
  });
  if (claim) return { ...claim.policy, matchedBy: 'claim', claimNumber: claim.number };

  return null;
}
