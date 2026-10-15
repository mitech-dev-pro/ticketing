import Image from 'next/image';
import type { ReactNode } from 'react';
import type { Role } from '@/lib/permissions';
import { SidebarNav } from './sidebar-nav';

export function Sidebar({
  role,
  newTicketTrigger,
  onNavigate,
}: {
  role: Role;
  newTicketTrigger?: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-navy">
      <div className="flex h-header shrink-0 items-center px-6">
        <Image
          src="/milife-lockup-white.png"
          alt="miLife Insurance"
          width={110}
          height={48}
          priority
        />
      </div>
      {newTicketTrigger}
      <div className="flex-1 overflow-y-auto">
        <SidebarNav role={role} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
