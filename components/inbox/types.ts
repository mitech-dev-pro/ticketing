import type { Priority, TicketStatus } from '@/generated/prisma/client';
import type { DeadlineTone } from '@/lib/dates';

export type InboxTab = 'unassigned' | 'assigned-to-me' | 'all-open' | 'resolved';

export const INBOX_TABS: { id: InboxTab; label: string }[] = [
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'assigned-to-me', label: 'Assigned to me' },
  { id: 'all-open', label: 'All open' },
  { id: 'resolved', label: 'Resolved' },
];

export interface InboxRow {
  number: number;
  subject: string;
  requesterName: string;
  requesterDepartmentName: string;
  confidential: boolean;
  priority: Priority;
  status: TicketStatus;
  dueAt: string;
  deadlineLabel: string;
  deadlineAbsolute: string;
  deadlineTone: DeadlineTone;
  assigneeId: string | null;
  assigneeName: string | null;
  locked: boolean;
  canPickUp: boolean;
}

export interface DepartmentMember {
  id: string;
  name: string;
}
