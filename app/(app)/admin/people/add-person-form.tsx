'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { addPerson } from './actions';
import { addPersonSchema, type AddPersonInput } from '@/lib/validation/people';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';

interface AddPersonFormProps {
  departments: { id: string; name: string }[];
}

const ROLE_OPTIONS: { value: AddPersonInput['role']; label: string }[] = [
  { value: 'MEMBER', label: 'Member' },
  { value: 'HEAD', label: 'Head' },
  { value: 'ADMIN', label: 'Admin' },
];

const BRANCH_OPTIONS: { value: AddPersonInput['branch']; label: string }[] = [
  { value: 'ACHIMOTA_HQ', label: 'Achimota HQ' },
  { value: 'KUMASI', label: 'Kumasi' },
  { value: 'TAKORADI', label: 'Takoradi' },
];

export function AddPersonForm({ departments }: AddPersonFormProps) {
  const [isPending, startTransition] = useTransition();
  const [addedName, setAddedName] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<AddPersonInput>({
    resolver: zodResolver(addPersonSchema),
    defaultValues: {
      role: 'MEMBER',
      branch: 'ACHIMOTA_HQ',
      departmentId: departments[0]?.id ?? '',
    },
  });

  const onSubmit = (input: AddPersonInput) => {
    startTransition(async () => {
      const result = await addPerson(input);
      if (result.ok) {
        setAddedName(input.name);
        reset();
        return;
      }
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field === '_form' ? 'root' : (field as keyof AddPersonInput), {
          message: messages[0],
        });
      }
    });
  };

  if (addedName) {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-control bg-teal/10 px-3 py-2 text-small text-ink">
          {addedName} has been added and emailed an invite to set their password.
        </p>
        <Button type="button" variant="secondary" onClick={() => setAddedName(null)}>
          Add another person
        </Button>
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
        <Label htmlFor="name">Name</Label>
        <Input id="name" aria-invalid={errors.name ? true : undefined} {...register('name')} />
        {errors.name ? <p className="text-small text-danger-fg">{errors.name.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          type="email"
          placeholder="name@milifeghana.com"
          aria-invalid={errors.email ? true : undefined}
          {...register('email')}
        />
        {errors.email ? <p className="text-small text-danger-fg">{errors.email.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="departmentId">Department</Label>
        <Select
          id="departmentId"
          aria-invalid={errors.departmentId ? true : undefined}
          {...register('departmentId')}
        >
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
        {errors.departmentId ? (
          <p className="text-small text-danger-fg">{errors.departmentId.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Role</Label>
        <Select id="role" aria-invalid={errors.role ? true : undefined} {...register('role')}>
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {errors.role ? <p className="text-small text-danger-fg">{errors.role.message}</p> : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="branch">Branch</Label>
        <Select id="branch" aria-invalid={errors.branch ? true : undefined} {...register('branch')}>
          {BRANCH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        {errors.branch ? (
          <p className="text-small text-danger-fg">{errors.branch.message}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input id="phone" type="tel" {...register('phone')} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ext">Extension (optional)</Label>
        <Input id="ext" {...register('ext')} />
      </div>

      <Button type="submit" disabled={isPending} className="mt-2 w-full">
        {isPending ? 'Adding…' : 'Add person'}
      </Button>
    </form>
  );
}
