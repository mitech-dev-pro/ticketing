'use client';

import { Menu } from 'lucide-react';
import { SheetTrigger } from '@/components/ui/sheet';
import { NotificationBell } from './notification-bell';
import { SearchBar } from './search-bar';
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

      <SearchBar />

      <NotificationBell notifications={notifications} unreadCount={unreadCount} />

      <ThemeToggle />
      <UserMenu name={name} role={role} />
    </header>
  );
}
