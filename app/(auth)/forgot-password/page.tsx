import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password — miLife Service Desk',
};

export default async function ForgotPasswordPage() {
  const session = await getSession();
  if (session) {
    redirect('/');
  }

  return (
    <>
      <h2 className="text-title font-bold text-ink">Forgot your password?</h2>
      <p className="mt-1 text-small text-muted">
        Enter your work email and we&apos;ll send you a link to reset it.
      </p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
    </>
  );
}
