'use server';

import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { create } from '@/lib/services/tickets';
import { createTicketSchema, type CreateTicketInput } from '@/lib/validation/tickets';
import { formError, type ActionResult } from '@/lib/validation/action-result';

interface ServiceTypeField {
  label: string;
  type: 'text' | 'select' | 'textarea' | 'checkbox';
  required: boolean;
  options?: string[];
}

function validateDynamicFields(
  fieldDefs: ServiceTypeField[],
  values: Record<string, unknown>,
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const field of fieldDefs) {
    if (!field.required) continue;
    const value = values[field.label];
    if (value === undefined || value === null || value === '') {
      errors[`fields.${field.label}`] = [`${field.label} is required`];
    }
  }
  return errors;
}

export async function createTicket(
  input: CreateTicketInput,
): Promise<ActionResult<{ number: number }>> {
  const session = await getSession();
  if (!session) {
    return formError("You don't have permission to create a ticket.");
  }

  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const serviceType = await prisma.serviceType.findUnique({
    where: { id: parsed.data.serviceTypeId },
  });
  if (!serviceType) {
    return { ok: false, fieldErrors: { serviceTypeId: ['Select what this is about'] } };
  }

  const fieldDefs = serviceType.fields as unknown as ServiceTypeField[];
  const fieldErrors = validateDynamicFields(fieldDefs, parsed.data.fields);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const created = await create({
    requesterId: session.user.id,
    requesterDepartmentId: session.user.departmentId,
    serviceTypeId: parsed.data.serviceTypeId,
    subject: parsed.data.subject,
    description: parsed.data.description,
    priority: parsed.data.priority,
    channel: 'PORTAL',
    confidential: parsed.data.confidential,
    fields: parsed.data.fields,
  });

  return { ok: true, data: created };
}
