import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { listAssets, getAsset, type AssetDetail } from '@/lib/services/assets';
import { AssetsTable } from '@/components/assets/assets-table';
import type { NewTicketData, NewTicketField } from '@/components/new-ticket/types';

export const metadata: Metadata = {
  title: 'Asset register — miLife Service Desk',
};

export default async function AssetsPage() {
  const session = await getSession();
  if (!session) redirect('/sign-in');

  const [summaries, departments, serviceTypes] = await Promise.all([
    listAssets(),
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

  const assets = (await Promise.all(summaries.map((a) => getAsset(a.id)))).filter(
    (a): a is AssetDetail => a !== null,
  );

  const newTicketData: NewTicketData = {
    departments,
    serviceTypes: serviceTypes.map((st) => ({
      ...st,
      fields: st.fields as unknown as NewTicketField[],
    })),
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-title font-bold text-ink">Asset register</h1>
        <p className="mt-1 text-small text-muted">
          Equipment managed by IT and Facilities, with every ticket raised against it.
        </p>
      </div>

      <AssetsTable assets={assets} newTicketData={newTicketData} />
    </div>
  );
}
