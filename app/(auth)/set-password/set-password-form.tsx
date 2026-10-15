'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { setPassword } from '../actions';
import { setPasswordSchema, type SetPasswordInput } from '@/lib/validation/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SetPasswordFormProps {
  token: string;
  type: 'RESET' | 'INVITE';
}

export function SetPasswordForm({ token, type }: SetPasswordFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { token, type },
  });

  const onSubmit = (input: SetPasswordInput) => {
    startTransition(async () => {
      const result = await setPassword(input);
      if (result.ok) {
        router.push(result.data.redirectTo);
        return;
      }
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field === '_form' ? 'root' : (field as keyof SetPasswordInput), {
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

      <input type="hidden" {...register('token')} />
      <input type="hidden" {...register('type')} />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-small text-danger-fg">{errors.password.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.confirmPassword ? true : undefined}
          {...register('confirmPassword')}
        />
        {errors.confirmPassword ? (
          <p className="text-small text-danger-fg">{errors.confirmPassword.message}</p>
        ) : null}
      </div>

      <Button type="submit" disabled={isPending} className="mt-2 w-full">
        {isPending ? 'Saving…' : 'Set password'}
      </Button>
    </form>
  );
}
