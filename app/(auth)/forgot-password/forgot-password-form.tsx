'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { requestPasswordReset } from '../actions';
import { requestPasswordResetSchema, type RequestPasswordResetInput } from '@/lib/validation/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RequestPasswordResetInput>({ resolver: zodResolver(requestPasswordResetSchema) });

  const onSubmit = (input: RequestPasswordResetInput) => {
    startTransition(async () => {
      const result = await requestPasswordReset(input);
      if (result.ok) {
        setConfirmation(result.data.message);
        return;
      }
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field === '_form' ? 'root' : (field as keyof RequestPasswordResetInput), {
          message: messages[0],
        });
      }
    });
  };

  if (confirmation) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-control bg-teal/10 px-3 py-2 text-small text-ink">{confirmation}</p>
        <Link
          href="/sign-in"
          className="text-small font-semibold text-teal-deep hover:text-teal-hover"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

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

      <Button type="submit" disabled={isPending} className="mt-2 w-full">
        {isPending ? 'Sending…' : 'Send reset link'}
      </Button>

      <Link
        href="/sign-in"
        className="text-center text-small font-semibold text-teal-deep hover:text-teal-hover"
      >
        Back to sign in
      </Link>
    </form>
  );
}
