import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = {
  title: 'Sign in — miLife Service Desk',
};

export default async function SignInPage() {
  const session = await getSession();
  if (session) {
    redirect('/');
  }

  return (
    <>
      <h2 className="text-title font-bold text-ink">Sign in</h2>
      <p className="mt-1 text-small text-muted">Use your miLife work email and password.</p>
      <div className="mt-6">
        <SignInForm />
      </div>
    </>
  );
}
