import { z } from 'zod';

export const lookupPolicySchema = z.object({
  query: z.string().trim().min(1, 'Enter a policy or claim number').max(50),
});
export type LookupPolicyInput = z.infer<typeof lookupPolicySchema>;
