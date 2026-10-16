'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { formatTicketId } from '@/lib/ids';
import { cn } from '@/lib/utils';
import { markAllNotificationsRead, markNotificationRead } from './notification-actions';
import type { NotificationItem } from './notification-types';

const KIND_LABEL: Record<NotificationItem['kind'], string> = {
  SLA_WARNING: 'is at 75% of its deadline',
  FIRST_RESPONSE_MISS: 'missed its first-response deadline',
  ESCALATED_L1: 'escalated to level 1',
  ESCALATED_L2: 'escalated to level 2',
};

interface NotificationBellProps {
  notifications: NotificationItem[];
  unreadCount: number;
}

export function NotificationBell({ notifications, unreadCount }: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  function handleMarkAllRead() {
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  function handleOpenNotification(id: string) {
    startTransition(async () => {
      await markNotificationRead(id);
      router.refresh();
    });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-control text-ink-2 hover:bg-hover"
      >
        <Bell size={18} />
        {unreadCount > 0 ? (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-urgent px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute top-full right-0 z-20 mt-2 w-80 rounded-card border border-line bg-surface shadow-modal">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <span className="text-small font-semibold text-ink">Notifications</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                disabled={isPending}
                onClick={handleMarkAllRead}
                className="text-label font-medium text-teal-deep hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-small text-muted">
                You&apos;re all caught up.
              </p>
            ) : (
              notifications.map((notification) => (
                <Link
                  key={notification.id}
                  href={`/tickets/${notification.ticketNumber}`}
                  onClick={() => {
                    setOpen(false);
                    if (!notification.readAt) handleOpenNotification(notification.id);
                  }}
                  className={cn(
                    'flex items-start gap-2 border-b border-line-2 px-3 py-2.5 text-small last:border-0 hover:bg-hover',
                    !notification.readAt && 'bg-teal-deep/5',
                  )}
                >
                  {!notification.readAt ? (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-deep" />
                  ) : (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="font-mono text-label text-muted">
                      {formatTicketId(notification.ticketNumber)}
                    </span>{' '}
                    <span className="text-ink-2">{KIND_LABEL[notification.kind]}</span>
                    <span className="block truncate text-faint">{notification.ticketSubject}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
