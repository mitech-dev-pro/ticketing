import * as React from 'react';
import { cn } from '@/lib/utils';

const PRIORITY_CLASSES = {
  URGENT: 'bg-urgent/15 text-urgent',
  HIGH: 'bg-high/15 text-high',
  MEDIUM: 'bg-medium/15 text-medium',
  LOW: 'bg-low/15 text-low',
} as const;

const STATUS_CLASSES = {
  OPEN: 'bg-status-open text-status-open-fg',
  IN_PROGRESS: 'bg-status-progress text-status-progress-fg',
  AWAITING_REQUESTER: 'bg-status-pending text-status-pending-fg',
  RESOLVED: 'bg-status-resolved text-status-resolved-fg',
  CLOSED: 'bg-status-closed text-status-closed-fg',
} as const;

function badgeBase(className?: string) {
  return cn(
    'inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-label font-mono uppercase tracking-wide',
    className,
  );
}

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={badgeBase(cn('bg-line text-muted', className))}>{children}</span>;
}

export function PriorityBadge({ priority }: { priority: keyof typeof PRIORITY_CLASSES }) {
  return <span className={badgeBase(PRIORITY_CLASSES[priority])}>{priority}</span>;
}

export function StatusBadge({ status }: { status: keyof typeof STATUS_CLASSES }) {
  return <span className={badgeBase(STATUS_CLASSES[status])}>{status.replace('_', ' ')}</span>;
}
