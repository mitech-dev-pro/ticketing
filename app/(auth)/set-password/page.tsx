import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { SetPasswordForm } from './set-password-form';

export const metadata: Metadata = {
  title: 'Set password — miLife Service Desk',
};

interface SetPasswordPageProps {
  searchParams: Promise<{ token?: string; type?: string }>;
}

export default async function SetPasswordPage({ searchParams }: SetPasswordPageProps) {
  const session = await getSession();
  if (session) {
    redirect('/');
  }

  const { token, type } = await searchParams;

  if (!token || (type !== 'RESET' && type !== 'INVITE')) {
    return (
      <>
        <h2 className="text-title font-bold text-ink">This link is invalid or has expired.</h2>
        <p className="mt-1 text-small text-muted">Request a new link and try again.</p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block text-small font-semibold text-teal-deep hover:text-teal-hover"
        >
          Request a new link
        </Link>
      </>
    );
  }

  const isInvite = type === 'INVITE';

  return (
    <>
      <h2 className="text-title font-bold text-ink">
        {isInvite ? 'Set your password' : 'Reset your password'}
      </h2>
      <p className="mt-1 text-small text-muted">
        {isInvite
          ? 'Welcome to miLife Service Desk. Choose a password to finish setting up your account.'
          : 'Choose a new password for your account.'}
      </p>
      <div className="mt-6">
        <SetPasswordForm token={token} type={type} />
      </div>
    </>
  );
}
