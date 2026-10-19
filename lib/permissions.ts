// Who can see and act on a ticket (D-05 to D-08, docs/PERMISSIONS.md).
//
// `can()` is a pure function: it takes the shapes below (built from a real Prisma
// query's `include`, or from seed JSON in tests) and never touches the database
// itself. Every ticket query must still be filtered through `visibleTicketsWhere(user)` —
// the per-item check here and that query clause must never disagree, or list/count/search
// pages could leak a ticket this function would refuse to show.

import type { Prisma } from '@/generated/prisma/client';

export type Action =
  | 'view'
  | 'reply' // public message to the requester
  | 'addNote' // internal note
  | 'readNotes'
  | 'assign' // assign or reassign to anyone in the department
  | 'pickUp' // assign an unassigned ticket to yourself
  | 'setPriority'
  | 'setStatus'
  | 'forward'
  | 'resolve'
  | 'merge'
  | 'escalate' // manual escalation to the next level
  | 'acknowledgeL1'
  | 'acknowledgeL2'
  | 'setConfidential' // turn confidentiality on or off
  | 'rate'
  | 'reopen'
  | 'markRatingFollowedUp' // head/admin dismisses the low-rating follow-up banner
  | 'bulk'
  | 'manageTasks' // add/toggle/remove the Tasks checklist
  | 'logTime' // start/stop timer, quick time entries
  | 'link'; // add/remove a Linked tickets row

export type Role = 'MEMBER' | 'HEAD' | 'ADMIN';

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'AWAITING_REQUESTER' | 'RESOLVED' | 'CLOSED';

export interface PermissionUser {
  id: string;
  role: Role;
  departmentId: string;
}

export interface PermissionTicketLeg {
  departmentId: string;
  /** null means this is the ticket's current, still-open leg. */
  outAt: Date | null;
}

export interface PermissionMention {
  type: 'person' | 'department';
  id: string;
}

export interface PermissionTicket {
  id: string;
  requesterId: string;
  requesterDepartmentId: string;
  assigneeId: string | null;
  confidential: boolean;
  status: TicketStatus;
  legs: PermissionTicketLeg[];
  mentions: PermissionMention[];
}

export interface PermissionRules {
  mentionedDepartmentsCanReply: boolean;
}

const defaultRules: PermissionRules = {
  mentionedDepartmentsCanReply: true,
};

export function currentDepartmentId(ticket: PermissionTicket): string {
  const openLeg = ticket.legs.find((leg) => leg.outAt === null);
  if (!openLeg) {
    throw new Error(`Ticket ${ticket.id} has no open leg`);
  }
  return openLeg.departmentId;
}

export function passedThroughDepartmentIds(ticket: PermissionTicket): string[] {
  return ticket.legs.map((leg) => leg.departmentId);
}

function canView(user: PermissionUser, ticket: PermissionTicket): boolean {
  const current = currentDepartmentId(ticket);
  const isRequester = user.id === ticket.requesterId;
  const isAssignee = user.id === ticket.assigneeId;
  const isAdmin = user.role === 'ADMIN';
  const isCurrentDepartmentMember = user.departmentId === current;
  const isHeadOfCurrentDepartment = user.role === 'HEAD' && isCurrentDepartmentMember;

  if (ticket.confidential) {
    return isAdmin || isRequester || isAssignee || isHeadOfCurrentDepartment;
  }

  const isHeadOfRequesterDepartment =
    user.role === 'HEAD' && user.departmentId === ticket.requesterDepartmentId;
  const isPassedThrough = passedThroughDepartmentIds(ticket).includes(user.departmentId);
  const isMentioned = ticket.mentions.some(
    (mention) =>
      (mention.type === 'person' && mention.id === user.id) ||
      (mention.type === 'department' && mention.id === user.departmentId),
  );

  return (
    isAdmin ||
    isRequester ||
    isCurrentDepartmentMember ||
    isHeadOfRequesterDepartment ||
    isMentioned ||
    isPassedThrough
  );
}

const lockedStatusActions: ReadonlySet<Action> = new Set<Action>([
  'reply',
  'addNote',
  'setPriority',
  'setStatus',
  'forward',
  'resolve',
  'merge',
  'assign',
  'pickUp',
  'bulk',
  'setConfidential',
  'escalate',
  'acknowledgeL1',
  'acknowledgeL2',
  'manageTasks',
  'logTime',
  'link',
]);

export function can(
  action: Action,
  user: PermissionUser,
  ticket: PermissionTicket,
  rules?: Partial<PermissionRules>,
): boolean {
  if (!canView(user, ticket)) {
    return false;
  }

  if (
    lockedStatusActions.has(action) &&
    (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED')
  ) {
    return false;
  }

  const current = currentDepartmentId(ticket);
  const isRequester = user.id === ticket.requesterId;
  const isAdmin = user.role === 'ADMIN';
  const isCurrentDepartmentMember = user.departmentId === current;
  const isHeadOfCurrentDepartment = user.role === 'HEAD' && isCurrentDepartmentMember;
  const effectiveRules = { ...defaultRules, ...rules };
  const isMentioned = ticket.mentions.some(
    (mention) =>
      (mention.type === 'person' && mention.id === user.id) ||
      (mention.type === 'department' && mention.id === user.departmentId),
  );
  const mentionGrantsHandling = isMentioned && effectiveRules.mentionedDepartmentsCanReply;

  switch (action) {
    case 'view':
      return true; // canView already passed above

    case 'reply':
      return isRequester || isCurrentDepartmentMember || isAdmin || mentionGrantsHandling;

    case 'addNote':
      return isCurrentDepartmentMember || isAdmin || mentionGrantsHandling;

    case 'readNotes': {
      const isPassedThrough = passedThroughDepartmentIds(ticket).includes(user.departmentId);
      return isCurrentDepartmentMember || isPassedThrough || isAdmin || mentionGrantsHandling;
    }

    case 'setPriority':
    case 'setStatus':
    case 'forward':
    case 'resolve':
    case 'merge':
    case 'manageTasks':
    case 'logTime':
    case 'link':
      return isCurrentDepartmentMember || isAdmin;

    case 'assign':
    case 'bulk':
    case 'setConfidential':
    case 'markRatingFollowedUp':
      return isHeadOfCurrentDepartment || isAdmin;

    case 'pickUp':
      return (isCurrentDepartmentMember || isAdmin) && ticket.assigneeId === null && !isRequester;

    case 'escalate':
      return isRequester || (isCurrentDepartmentMember && !isHeadOfCurrentDepartment);

    case 'acknowledgeL1':
      return isHeadOfCurrentDepartment || isAdmin;

    case 'acknowledgeL2':
      return isAdmin;

    case 'rate':
    case 'reopen':
      return isRequester && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED');

    default: {
      const exhaustive: never = action;
      return exhaustive;
    }
  }
}

// Builds the `prisma.ticket.findMany({ where })` clause every list, count, badge, search,
// report and export must use. It must agree with `can('view', user, ticket)` for every
// ticket — tests/integration/visible-tickets.test.ts proves this for every seed user and
// ticket — or a list could leak a ticket the per-item check would refuse to show.
export function visibleTicketsWhere(user: PermissionUser): Prisma.TicketWhereInput {
  if (user.role === 'ADMIN') return {};

  const orClauses: Prisma.TicketWhereInput[] = [{ requesterId: user.id }, { assigneeId: user.id }];

  if (user.role === 'HEAD') {
    // Head of the current department: allowed even on a confidential ticket.
    orClauses.push({ legs: { some: { departmentId: user.departmentId, outAt: null } } });
  }

  orClauses.push({
    confidential: false,
    OR: [
      { legs: { some: { departmentId: user.departmentId, outAt: null } } }, // current dept (team inbox)
      ...(user.role === 'HEAD' ? [{ requesterDepartmentId: user.departmentId }] : []),
      {
        mentions: {
          some: {
            OR: [
              { type: 'PERSON' as const, userId: user.id },
              { type: 'DEPARTMENT' as const, departmentId: user.departmentId },
            ],
          },
        },
      },
      { legs: { some: { departmentId: user.departmentId } } }, // passed through, read-only
    ],
  });

  return { OR: orClauses };
}

// Administration (departments, people, SLA, rules, templates, channels, retention, audit
// log) is admin-only — docs/PERMISSIONS.md: "Only admins see Administration."
export function canManagePeople(user: { role: Role }): boolean {
  return user.role === 'ADMIN';
}

// Workload, Escalations and Reports are head/admin nav sections per the design handoff
// README's role table (members don't get department-wide oversight views).
export function isHeadOrAdmin(user: { role: Role }): boolean {
  return user.role === 'HEAD' || user.role === 'ADMIN';
}
