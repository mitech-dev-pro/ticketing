'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/select';

export function DepartmentFilter({
  departments,
  value,
}: {
  departments: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();

  return (
    <Select
      className="h-9 w-48"
      value={value}
      onChange={(event) => {
        const params = new URLSearchParams(window.location.search);
        params.set('department', event.target.value);
        router.push(`/inbox?${params.toString()}`);
      }}
    >
      {departments.map((department) => (
        <option key={department.id} value={department.id}>
          {department.name}
        </option>
      ))}
    </Select>
  );
}
