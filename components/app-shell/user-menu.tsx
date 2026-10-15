'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';
import { signOut } from '@/app/(auth)/actions';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const ROLE_LABELS = { MEMBER: 'Member', HEAD: 'Department head', ADMIN: 'Admin' } as const;

interface UserMenuProps {
  name: string;
  role: keyof typeof ROLE_LABELS;
}

export function UserMenu({ name, role }: UserMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSignOut = () => {
    startTransition(async () => {
      const result = await signOut();
      if (result.ok) {
        router.push(result.data.redirectTo);
        router.refresh();
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={isPending}
          className="flex h-9 items-center gap-2 rounded-control px-2 text-ink-2 hover:bg-hover disabled:opacity-50"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-subtle text-ink-2">
            <User size={16} />
          </span>
          <span className="hidden text-small font-medium text-ink narrow:inline">{name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{ROLE_LABELS[role]}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOut size={16} className="text-ink-2" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
