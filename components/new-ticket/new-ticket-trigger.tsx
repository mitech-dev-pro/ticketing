import { prisma } from '@/lib/db';
import { NewTicketDialog } from './new-ticket-dialog';
import type { NewTicketData, NewTicketField } from './types';

export async function NewTicketTrigger() {
  const [departments, serviceTypes] = await Promise.all([
    prisma.department.findMany({
      select: { id: true, slug: true, name: true, confidentialByDefault: true },
      orderBy: { name: 'asc' },
    }),
    prisma.serviceType.findMany({
      select: {
        id: true,
        departmentId: true,
        name: true,
        description: true,
        defaultPriority: true,
        fields: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const data: NewTicketData = {
    departments,
    serviceTypes: serviceTypes.map((serviceType) => ({
      ...serviceType,
      fields: serviceType.fields as unknown as NewTicketField[],
    })),
  };

  return <NewTicketDialog data={data} />;
}
