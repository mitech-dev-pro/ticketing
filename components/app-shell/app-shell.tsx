'use client';

import { useState, type ReactNode } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { UndoToastProvider } from '@/components/ui/undo-toast';
import { Header } from './header';
import { Sidebar } from './sidebar';
import type { Role } from '@/lib/permissions';

interface AppShellProps {
  user: { name: string; role: Role };
  newTicketTrigger?: ReactNode;
  children: ReactNode;
}

export function AppShell({ user, newTicketTrigger, children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <UndoToastProvider>
      <div className="flex min-h-screen">
        <aside className="hidden w-sidebar shrink-0 narrow:flex">
          <Sidebar role={user.role} newTicketTrigger={newTicketTrigger} />
        </aside>

        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent>
            <Sidebar
              role={user.role}
              newTicketTrigger={newTicketTrigger}
              onNavigate={() => setNavOpen(false)}
            />
          </SheetContent>

          <div className="flex min-w-0 flex-1 flex-col bg-bg">
            <Header name={user.name} role={user.role} />
            <main className="flex-1 px-6 pt-[22px] pb-10">{children}</main>
          </div>
        </Sheet>
      </div>
    </UndoToastProvider>
  );
}
