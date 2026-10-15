'use server';

import { getSession } from '@/lib/auth';
import { canManagePeople } from '@/lib/permissions';
import { addPersonSchema, type AddPersonInput } from '@/lib/validation/people';
import { addPerson as createPerson, DuplicateEmailError } from '@/lib/services/users';
import { formError, type ActionResult } from '@/lib/validation/action-result';

const FORBIDDEN_ERROR = "You don't have permission to add people.";

export async function addPerson(input: AddPersonInput): Promise<ActionResult<{ id: string }>> {
  const session = await getSession();
  if (!session || !canManagePeople(session.user)) {
    return formError(FORBIDDEN_ERROR);
  }

  const parsed = addPersonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const created = await createPerson(parsed.data);
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      return { ok: false, fieldErrors: { email: ['A person with this email already exists.'] } };
    }
    throw error;
  }
}
