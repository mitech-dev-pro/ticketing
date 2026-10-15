'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { signIn } from '../actions';
import { signInSchema, type SignInInput } from '@/lib/validation/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SignInForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });

  const onSubmit = (input: SignInInput) => {
    startTransition(async () => {
      const result = await signIn(input);
      if (result.ok) {
        router.push(result.data.redirectTo);
        router.refresh();
        return;
      }
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field === '_form' ? 'root' : (field as keyof SignInInput), {
          message: messages[0],
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {errors.root?.message ? (
        <p className="rounded-control bg-danger px-3 py-2 text-small text-danger-fg">
          {errors.root.message}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          placeholder="name@milifeghana.com"
          aria-invalid={errors.email ? true : undefined}
          {...register('email')}
        />
        {errors.email ? <p className="text-small text-danger-fg">{errors.email.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-small font-semibold text-teal-deep hover:text-teal-hover"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-small text-danger-fg">{errors.password.message}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={isPending} className="mt-2 w-full">
        {isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
