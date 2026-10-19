import type { Channel, Priority, TicketEventType, TicketStatus } from '@/generated/prisma/client';
import type { DeadlineDisplay } from '@/lib/dates';

export interface TicketFieldDef {
  label: string;
  type: 'text' | 'select' | 'textarea' | 'checkbox';
  required: boolean;
  options?: string[];
}

export interface JourneyLeg {
  id: string;
  departmentId: string;
  departmentName: string;
  hue: number;
  byName: string;
  reason: string | null;
  inAt: string;
  outAt: string | null;
}

export interface ConversationAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ConversationEvent {
  id: string;
  type: TicketEventType;
  byName: string | null;
  body: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  attachments: ConversationAttachment[];
}

export interface DepartmentOption {
  id: string;
  name: string;
  hue: number;
  confidentialByDefault: boolean;
}

export interface MemberOption {
  id: string;
  name: string;
}

export interface CannedReplyOption {
  id: string;
  title: string;
  body: string;
}

export interface TicketPermissions {
  reply: boolean;
  addNote: boolean;
  readNotes: boolean;
  assign: boolean;
  pickUp: boolean;
  setPriority: boolean;
  setStatus: boolean;
  forward: boolean;
  resolve: boolean;
  reopen: boolean;
  rate: boolean;
  markRatingFollowedUp: boolean;
  escalate: boolean;
  manageTasks: boolean;
  logTime: boolean;
  link: boolean;
  merge: boolean;
  addSubTicket: boolean;
}

export interface TaskItem {
  id: string;
  text: string;
  done: boolean;
}

export interface TimeEntryItem {
  id: string;
  userName: string;
  minutes: number;
  createdAt: string;
}

export interface LinkedTicketItem {
  type: 'BLOCKED_BY' | 'BLOCKS' | 'RELATED_TO';
  ticket: { number: number; subject: string; status: TicketStatus };
}

export interface SubTicketItem {
  number: number;
  subject: string;
  status: TicketStatus;
}

export interface PossibleDuplicateItem {
  number: number;
  subject: string;
}

export interface AssetSummary {
  id: string;
  type: string;
  model: string;
  location: string;
  status: string;
}

export interface TicketDetail {
  number: number;
  subject: string;
  description: string;
  fields: Record<string, unknown>;
  priority: Priority;
  status: TicketStatus;
  channel: Channel;
  confidential: boolean;
  csat: number | null;
  ratingFollowedUpAt: string | null;
  createdAt: string;
  dueAt: string;
  deadlinePercentElapsed: number;
  requester: { id: string; name: string; departmentName: string };
  assignee: { id: string; name: string } | null;
  serviceType: { name: string; fields: TicketFieldDef[] };
  currentDepartmentId: string;
  legs: JourneyLeg[];
  deadline: DeadlineDisplay;
  locked: boolean;
  /** Highest escalation level still unacknowledged, or null if none. */
  openEscalationLevel: number | null;
  /** README header tag: an unresolved blocked_by link exists. */
  blocked: boolean;
  parent: { number: number; subject: string } | null;
  mergedInto: { number: number; subject: string } | null;
  asset: AssetSummary | null;
  policyNumber: string | null;
}
