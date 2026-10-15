/**
 * Permissions matrix — the contract lib/permissions.ts must satisfy.
 *
 * Written BEFORE the implementation (Phase 1) so the rules can be reviewed by
 * miLife in plain language: every row reads "<who> <can/cannot> <action> on
 * <ticket> because <why>". Rules are explained in docs/PERMISSIONS.md.
 *
 * People and tickets are the real seed records (prisma/seed-data/*.json), so a
 * failing case points at data anyone can open in the app.
 *
 * Two test files consume this table:
 *   tests/unit/permissions.test.ts         → can(action, user, ticket, rules) per row
 *   tests/integration/visibility.test.ts   → for every user, the ticket ids returned by
 *       prisma.ticket.findMany({ where: visibleTicketsWhere(user) }) must equal the ids
 *       for which can('view', …) is true. That is what stops leaks via lists, counts
 *       and search: the per-item check and the query clause cannot disagree.
 */

import type { Action } from '@/lib/permissions';

export type { Action };

export interface Case {
  who: string; // seed email (local part only, @milife.test is implied)
  action: Action;
  ticket: number; // MLT number from the seed
  expected: boolean;
  why: string;
  rules?: Partial<{ mentionedDepartmentsCanReply: boolean }>;
}

/*
 * Ticket cheat-sheet (from prisma/seed-data/tickets.json)
 *   24817  Finance · requester Esi Quaye (Customer Service) · assignee Linda Ansah
 *          · came from Claims · Felix Owusu @mentioned · level-1 escalation open
 *   24814  Finance · requester Esi Quaye · unassigned · came from IT
 *          · Customer Service department @mentioned
 *   24806  HR · CONFIDENTIAL · requester Esi Quaye · assignee Afua Sarpong
 *   24815  HR · CONFIDENTIAL · requester Kojo Appiah · assignee Gifty Mensah (head)
 *   24803  Legal · CONFIDENTIAL · requester Abena Osei · assignee Mawuli Dzah (head)
 *   24791  IT · RESOLVED · requester Kofi Boateng · assignee Yaw Mensah
 */
export const CASES: Case[] = [
  // ---------- view: ordinary ticket 24817 ----------
  { who: 'esi.quaye', action: 'view', ticket: 24817, expected: true, why: 'requester' },
  {
    who: 'linda.ansah',
    action: 'view',
    ticket: 24817,
    expected: true,
    why: 'assignee, and member of the current department',
  },
  {
    who: 'felix.owusu',
    action: 'view',
    ticket: 24817,
    expected: true,
    why: 'head of the current department',
  },
  {
    who: 'abena.osei',
    action: 'view',
    ticket: 24817,
    expected: true,
    why: 'ticket passed through Claims',
  },
  {
    who: 'kweku.addo',
    action: 'view',
    ticket: 24817,
    expected: true,
    why: 'member of Claims, which the ticket passed through',
  },
  {
    who: 'adwoa.nyarko',
    action: 'view',
    ticket: 24817,
    expected: true,
    why: "head of the requester's department",
  },
  {
    who: 'ama.owusu',
    action: 'view',
    ticket: 24817,
    expected: false,
    why: "member of the requester's department sees only their own requests",
  },
  {
    who: 'kojo.appiah',
    action: 'view',
    ticket: 24817,
    expected: false,
    why: 'IT never touched this ticket',
  },
  {
    who: 'ama.serwaa',
    action: 'view',
    ticket: 24817,
    expected: true,
    why: 'admin sees everything',
  },

  // ---------- view: department mention (24814) ----------
  {
    who: 'ama.owusu',
    action: 'view',
    ticket: 24814,
    expected: true,
    why: 'Customer Service was @mentioned',
  },
  {
    who: 'ama.owusu',
    action: 'view',
    ticket: 24814,
    expected: true,
    why: 'a mention grants read access even when replies are switched off',
    rules: { mentionedDepartmentsCanReply: false },
  },
  {
    who: 'yaw.mensah',
    action: 'view',
    ticket: 24814,
    expected: true,
    why: 'ticket passed through IT',
  },
  {
    who: 'kofi.boateng',
    action: 'view',
    ticket: 24814,
    expected: false,
    why: 'Underwriting not involved',
  },

  // ---------- view: confidential ----------
  {
    who: 'esi.quaye',
    action: 'view',
    ticket: 24806,
    expected: true,
    why: 'requester of a confidential ticket',
  },
  {
    who: 'afua.sarpong',
    action: 'view',
    ticket: 24806,
    expected: true,
    why: 'assignee of a confidential ticket',
  },
  {
    who: 'gifty.mensah',
    action: 'view',
    ticket: 24806,
    expected: true,
    why: 'head of HR, the current department',
  },
  {
    who: 'adwoa.nyarko',
    action: 'view',
    ticket: 24806,
    expected: false,
    why: "confidential: requester's head gets no access",
  },
  { who: 'ama.serwaa', action: 'view', ticket: 24806, expected: true, why: 'admin' },
  {
    who: 'afua.sarpong',
    action: 'view',
    ticket: 24815,
    expected: false,
    why: 'confidential: HR member who is not the assignee',
  },
  {
    who: 'yaw.mensah',
    action: 'view',
    ticket: 24815,
    expected: false,
    why: 'confidential: being the subject of a letter grants nothing',
  },
  { who: 'kojo.appiah', action: 'view', ticket: 24815, expected: true, why: 'requester' },
  {
    who: 'kweku.addo',
    action: 'view',
    ticket: 24803,
    expected: false,
    why: "confidential: requester's colleague in Claims",
  },
  {
    who: 'selasi.amegah',
    action: 'view',
    ticket: 24803,
    expected: false,
    why: 'confidential: head of another department',
  },

  // ---------- conversation ----------
  { who: 'esi.quaye', action: 'reply', ticket: 24817, expected: true, why: 'requester can reply' },
  {
    who: 'esi.quaye',
    action: 'addNote',
    ticket: 24817,
    expected: false,
    why: 'requester cannot write internal notes',
  },
  {
    who: 'esi.quaye',
    action: 'readNotes',
    ticket: 24817,
    expected: false,
    why: 'internal notes are hidden from the requester',
  },
  {
    who: 'adwoa.nyarko',
    action: 'readNotes',
    ticket: 24817,
    expected: false,
    why: "requester's head sees the ticket as the requester does",
  },
  {
    who: 'abena.osei',
    action: 'readNotes',
    ticket: 24817,
    expected: true,
    why: 'Claims handled the ticket earlier',
  },
  {
    who: 'abena.osei',
    action: 'reply',
    ticket: 24817,
    expected: false,
    why: 'passed-through departments are read-only',
  },
  { who: 'linda.ansah', action: 'addNote', ticket: 24817, expected: true, why: 'handler' },
  {
    who: 'adwoa.nyarko',
    action: 'reply',
    ticket: 24814,
    expected: true,
    why: 'mentioned department can reply (rule on)',
  },
  {
    who: 'ama.owusu',
    action: 'addNote',
    ticket: 24814,
    expected: true,
    why: 'mentioned department can add notes (rule on)',
  },
  {
    who: 'ama.owusu',
    action: 'reply',
    ticket: 24814,
    expected: false,
    why: 'rule off: mentioned department is read-only',
    rules: { mentionedDepartmentsCanReply: false },
  },

  // ---------- assignment ----------
  {
    who: 'felix.owusu',
    action: 'assign',
    ticket: 24817,
    expected: true,
    why: 'head of the current department',
  },
  {
    who: 'linda.ansah',
    action: 'assign',
    ticket: 24817,
    expected: false,
    why: 'members cannot reassign',
  },
  {
    who: 'linda.ansah',
    action: 'pickUp',
    ticket: 24814,
    expected: true,
    why: 'member can pick up an unassigned ticket in their department',
  },
  { who: 'linda.ansah', action: 'pickUp', ticket: 24817, expected: false, why: 'already assigned' },
  {
    who: 'kojo.appiah',
    action: 'assign',
    ticket: 24817,
    expected: false,
    why: 'head of another department',
  },
  { who: 'ama.serwaa', action: 'assign', ticket: 24817, expected: true, why: 'admin' },
  {
    who: 'felix.owusu',
    action: 'bulk',
    ticket: 24817,
    expected: true,
    why: 'bulk actions are for heads in their department',
  },
  {
    who: 'linda.ansah',
    action: 'bulk',
    ticket: 24817,
    expected: false,
    why: 'members have no bulk bar',
  },

  // ---------- handling ----------
  {
    who: 'linda.ansah',
    action: 'forward',
    ticket: 24817,
    expected: true,
    why: 'any member of the current department can forward',
  },
  { who: 'linda.ansah', action: 'resolve', ticket: 24817, expected: true, why: 'handler' },
  { who: 'linda.ansah', action: 'setPriority', ticket: 24817, expected: true, why: 'handler' },
  { who: 'linda.ansah', action: 'merge', ticket: 24817, expected: true, why: 'handler' },
  {
    who: 'esi.quaye',
    action: 'forward',
    ticket: 24817,
    expected: false,
    why: 'requester does not handle',
  },
  {
    who: 'esi.quaye',
    action: 'setPriority',
    ticket: 24817,
    expected: false,
    why: 'requester does not handle',
  },
  {
    who: 'abena.osei',
    action: 'forward',
    ticket: 24817,
    expected: false,
    why: 'ticket has left Claims',
  },
  {
    who: 'adwoa.nyarko',
    action: 'resolve',
    ticket: 24814,
    expected: false,
    why: 'mentioned department does not own the ticket',
  },
  {
    who: 'yaw.mensah',
    action: 'setStatus',
    ticket: 24791,
    expected: false,
    why: 'resolved tickets change only by reopen',
  },

  // ---------- escalation ----------
  {
    who: 'esi.quaye',
    action: 'escalate',
    ticket: 24817,
    expected: true,
    why: 'requester can escalate to the next level',
  },
  {
    who: 'linda.ansah',
    action: 'escalate',
    ticket: 24817,
    expected: true,
    why: 'handler who is not the head can escalate',
  },
  {
    who: 'felix.owusu',
    action: 'escalate',
    ticket: 24817,
    expected: false,
    why: 'the head is the escalation target',
  },
  {
    who: 'felix.owusu',
    action: 'acknowledgeL1',
    ticket: 24817,
    expected: true,
    why: 'level 1 goes to the head of the current department',
  },
  {
    who: 'linda.ansah',
    action: 'acknowledgeL1',
    ticket: 24817,
    expected: false,
    why: 'members cannot acknowledge',
  },
  {
    who: 'felix.owusu',
    action: 'acknowledgeL2',
    ticket: 24817,
    expected: false,
    why: 'level 2 goes to admin / COO',
  },
  { who: 'ama.serwaa', action: 'acknowledgeL2', ticket: 24817, expected: true, why: 'admin' },

  // ---------- confidentiality flag ----------
  {
    who: 'gifty.mensah',
    action: 'setConfidential',
    ticket: 24806,
    expected: true,
    why: 'head of the current department',
  },
  {
    who: 'afua.sarpong',
    action: 'setConfidential',
    ticket: 24806,
    expected: false,
    why: 'only heads and admins change confidentiality',
  },
  {
    who: 'esi.quaye',
    action: 'setConfidential',
    ticket: 24806,
    expected: false,
    why: 'requester cannot lower confidentiality',
  },

  // ---------- requester actions on a resolved ticket ----------
  {
    who: 'kofi.boateng',
    action: 'rate',
    ticket: 24791,
    expected: true,
    why: 'requester rates a resolved ticket',
  },
  {
    who: 'kofi.boateng',
    action: 'reopen',
    ticket: 24791,
    expected: true,
    why: 'requester reopens a resolved ticket',
  },
  {
    who: 'yaw.mensah',
    action: 'rate',
    ticket: 24791,
    expected: false,
    why: 'only the requester rates',
  },
  {
    who: 'kofi.boateng',
    action: 'rate',
    ticket: 24817,
    expected: false,
    why: 'cannot see the ticket, and it is not resolved',
  },
];
