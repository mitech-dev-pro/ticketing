'use client';

import { Menu, Search } from 'lucide-react';
import { SheetTrigger } from '@/components/ui/sheet';
import { NotificationBell } from './notification-bell';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';
import type { Role } from '@/lib/permissions';
import type { NotificationItem } from './notification-types';

interface HeaderProps {
  name: string;
  role: Role;
  notifications: NotificationItem[];
  unreadCount: number;
}

export function Header({ name, role, notifications, unreadCount }: HeaderProps) {
  return (
    <header className="flex h-header shrink-0 items-center gap-3 border-b border-line bg-surface px-4 narrow:px-6">
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="flex h-9 w-9 items-center justify-center rounded-control text-ink-2 hover:bg-hover narrow:hidden"
        >
          <Menu size={20} />
        </button>
      </SheetTrigger>

      <div className="flex flex-1 items-center gap-2 rounded-control bg-subtle px-3 text-ink-2">
        <Search size={16} />
        <input
          type="search"
          disabled
          placeholder="Search"
          className="h-9 w-full bg-transparent text-small text-ink placeholder:text-faint outline-none disabled:cursor-not-allowed"
        />
      </div>

      <NotificationBell notifications={notifications} unreadCount={unreadCount} />

      <ThemeToggle />
      <UserMenu name={name} role={role} />
    </header>
  );
}
