import type { Priority, TicketStatus } from '@/generated/prisma/client';

export interface EscalationRow {
  id: string;
  level: number;
  reason: string | null;
  at: string;
  byName: string | null;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  ticketNumber: number;
  ticketSubject: string;
  ticketStatus: TicketStatus;
  ticketPriority: Priority;
  canAcknowledge: boolean;
}
