import type { NotificationKind } from '@/generated/prisma/client';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  ticketNumber: number;
  ticketSubject: string;
  readAt: string | null;
  createdAt: string;
}
