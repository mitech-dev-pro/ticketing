import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { canManagePeople } from '@/lib/permissions';
import { prisma } from '@/lib/db';
import { AddPersonForm } from './add-person-form';

export const metadata: Metadata = {
  title: 'Add person — miLife Service Desk',
};

export default async function AddPersonPage() {
  const session = await getSession();
  if (!session) {
    redirect('/sign-in');
  }
  if (!canManagePeople(session.user)) {
    redirect('/');
  }

  const departments = await prisma.department.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <h1 className="text-title font-bold text-ink">Add person</h1>
      <p className="mt-1 text-small text-muted">
        They&apos;ll get an email to set their own password.
      </p>
      <div className="mt-6">
        <AddPersonForm departments={departments} />
      </div>
    </div>
  );
}
