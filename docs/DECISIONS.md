# miLife Service Desk — Decision record

Agreed before Phase 0 on 15 Oct 2026. This file, together with the plan PDF, is the
source of truth. Where the README, BUILD_PLAN or prototype disagree with it, this file
wins. Change a decision by editing it here (with the date) before changing code.

**Status key.** _Decided_: build it this way. _Default_: build it this way now, but
miLife must confirm; the design keeps it cheap to change. _Open_: needs an answer by the
phase shown.

| #    | Topic                                        | Status                              | Needed by              |
| ---- | -------------------------------------------- | ----------------------------------- | ---------------------- |
| D-01 | SLA calendar (24/7 or business hours)        | Default                             | Phase 4                |
| D-02 | First-response deadline                      | Decided                             | Phase 2                |
| D-03 | Clock pauses while Awaiting requester        | Default                             | Phase 2                |
| D-04 | Level-2 escalation window and recipient      | Default (window) / Open (recipient) | Phase 4                |
| D-05 | Who can see a ticket                         | Default                             | Phase 1                |
| D-06 | Who can act on a ticket                      | Default                             | Phase 1                |
| D-07 | Confidentiality across forwards and mentions | Default                             | Phase 1                |
| D-08 | Members pick up unassigned tickets           | Default                             | Phase 2                |
| D-09 | Undo implementation                          | Decided                             | Phase 3                |
| D-10 | Live updates                                 | Decided                             | Phase 3                |
| D-11 | Hosting region and Act 843                   | Open                                | Before production data |
| D-12 | Ticket numbers and gaps                      | Decided                             | Phase 2                |
| D-13 | Seed data                                    | Decided                             | Phase 1                |
| D-14 | Versions and library choices                 | Decided                             | Phase 0                |
| D-15 | Manual escalation                            | Decided                             | Phase 4                |

---

## D-01 SLA calendar — _Default: 24/7 for every priority_

The plan and prototype both count wall-clock time. Many desks count only working hours,
so we discussed switching. We are **not** switching yet, because the current targets only
make sense on a 24/7 clock: in business hours (08:00–17:00, 9 h a day) "High: 8 h" and
"Medium: 1 day" become almost the same deadline.

So `lib/sla.ts` is written against a calendar, and every priority has its own calendar
setting (`sla.calendar` = `24x7` or `business`). Business hours and Ghana public holidays
are stored settings (`sla.businessHours`, `Holiday` table). Switching later is a settings
change plus a target review, not a rewrite.

**miLife to confirm:** stay 24/7, or move some priorities to business hours _and_ retune
their targets.

## D-02 First-response deadline — _Decided_

Ticket gains `firstResponseDueAt` beside `dueAt`. `firstResponseAt` is set by the first
public reply from anyone in the handling department (not a note, not the requester).
Missing it turns the ticket amber and notifies the assignee and head. It does **not**
escalate; only the resolution deadline escalates, as in the prototype.

## D-03 Pause while Awaiting requester — _Default: pause_

The prototype shows "Paused" for tickets in Awaiting requester. Forwards never pause the
clock (the requester is still waiting), but waiting _on_ the requester does.

Implementation: Ticket gains `pausedAt` (set on entering Awaiting requester) and
`pausedMs` (accumulated). On leaving that status, `pausedMs += now − pausedAt` and
`dueAt` moves forward by the same amount. All deadline maths is
`createdAt + target + pausedMs` on the ticket's calendar, so a priority change still
recomputes from `createdAt`. Setting `sla.pauseWhileAwaitingRequester` turns it off.

## D-04 Level-2 escalation — _Default window, open recipient_

Window: level 2 fires when a ticket stays unresolved for a further full resolution target
after breaching (Urgent: 4 h after breach), as in the prototype. Stored as a setting.

**Open (Phase 4):** who is the COO recipient. Until answered, level 2 notifies every
admin; setting `escalation.level2UserIds` will hold the named people.

## D-05 Who can see a ticket — _Default: follow the prototype_

The written role table says members see only what they raised, are assigned or are
mentioned on. The prototype gives members their department's team inbox ("Pick up
unassigned ones or work your own"), and a department cannot work otherwise. We follow the
prototype. A user can view a ticket when the confidentiality gate passes **and** any of:

1. they are an admin;
2. the ticket is currently with their department (team inbox);
3. they raised it;
4. they are a head and the requester is in their department;
5. they or their department are @mentioned on it;
6. it passed through their department (an earlier leg).

The confidentiality gate: a confidential ticket is visible only to its requester, its
current assignee, the head of its current department, and admins. Nothing else in the
list above opens it.

`visibleTicketsWhere(user)` encodes exactly this, and an integration test proves it agrees
with `canView` for every seed user and ticket (see `tests/unit/permissions.matrix.ts`).

## D-06 Who can act — _Default: follow the prototype_

The prototype lets anyone in the handling department work the ticket, and keeps
assignment, bulk actions and acknowledgement for heads. Full table in
`docs/PERMISSIONS.md`. Key points: members of the current department can reply, add
notes, change priority and status, forward, resolve, merge and add sub-tickets; only the
head (or admin) assigns, uses bulk actions and acknowledges level 1; only admins
acknowledge level 2. Passed-through departments are read-only. Internal notes are hidden
from the requester and from the requester's head.

## D-07 Confidentiality across forwards and mentions — _Default_

- **Sticky.** Forwarding never clears the flag.
- **Forwarding into HR, Legal or Compliance** (or any department with
  `confidentialByDefault`) shows the confidential toggle switched on in the forward
  dialog; the person forwarding can switch it off.
- **Changing the flag** is limited to the head of the current department and admins,
  and always writes an event.
- **Mentions on confidential tickets** grant nothing. The @ picker only offers people
  who can already see the ticket, and departments cannot be mentioned.
- **Access moves with the ticket.** After a confidential ticket is forwarded, the
  previous department's head and the cleared assignee lose access.

## D-08 Members pick up unassigned tickets — _Default_

The prototype tells members to "pick up unassigned ones" but gives no control for it. We
add **Pick up** (assign to me) for members on unassigned tickets in their department.
Reassigning someone else's ticket stays with heads.

## D-09 Undo — _Decided: delay the commit on the client_

Send, resolve and forward wait 6 seconds in the browser before calling the server, while
the toast shows Undo. Undo simply cancels, so nothing is written and the append-only log
stays clean. If the page is closed or navigated away during the window, the pending action
is sent at once with `fetch(..., { keepalive: true })` to `POST /api/actions/commit`,
which calls the same service function as the Server Action.

## D-10 Live updates — _Decided: polling_

No websockets on serverless. The ticket page and the inbox call `router.refresh()` every
20 seconds while the tab is visible, and immediately on focus. The prototype's typing
indicator is dropped. Pusher or Ably can be added later behind a small interface.

## D-11 Hosting region — _Open (before production data)_

Plan of record: Vercel plus managed MySQL 8 in the same region. Compliance must confirm
that region is acceptable under the Data Protection Act 2012 (Act 843) before real data
is loaded. If in-country hosting is required, the fallback is a single Ghana-hosted VPS
(Docker, Next.js standalone output, MySQL 8, system cron calling the same `/api/cron/*`
routes). To keep that fallback cheap:

- nothing outside `lib/storage.ts`, `lib/email.ts` and `vercel.json` may depend on Vercel;
- cron jobs are plain authenticated HTTP routes, so any scheduler can call them;
- `next.config.ts` sets `output: 'standalone'`.

Local development (Docker MySQL) does not wait on this. The Phase 0 "first Vercel
deployment" step uses a throwaway preview database until the region is agreed.

## D-12 Ticket numbers — _Decided_

`Ticket.number` is the primary key: `Int @id @default(autoincrement())`. The first Ticket
migration ends with `ALTER TABLE Ticket AUTO_INCREMENT = 24827;` (Prisma cannot express a
start value, so it is added by hand to the generated SQL). Seed tickets keep their
prototype numbers (24788–24826); MySQL then continues from 24827. URLs accept
`/tickets/24827` and `/tickets/MLT-24827`; `lib/ids.ts` formats and parses.

MySQL does not reuse a number after a rolled-back insert, so numbers can have gaps.
That is expected; tell the business so nobody reports "missing" tickets.

## D-13 Seed data — _Decided_

`scripts/extract-prototype-data.mjs` reads the prototype and writes
`prisma/seed-data/*.json`; `prisma/seed.ts` reads only that JSON. The prototype is never
imported by the app.

- Emails use the reserved `@milife.test` domain, so a misconfigured seed can never email
  a real person. Dev password comes from `SEED_PASSWORD`.
- Times are stored as minutes relative to now, so seeded tickets always look fresh.
- The prototype overrides some due dates to stage screenshots. The seed does **not** copy
  them: it recomputes every deadline with `lib/sla.ts`, so seed data obeys the same rules
  as real data.
- Seed refuses to run when `NODE_ENV=production` unless `ALLOW_PROD_SEED=1`.

## D-14 Versions and library choices — _Decided_

Pin exact versions, choosing releases at least two weeks old. Checked 15 Oct 2026:

| Package                               | Pin          | Note                                                                       |
| ------------------------------------- | ------------ | -------------------------------------------------------------------------- |
| next                                  | 16.3.8       | Next 16 names route middleware `proxy.ts`                                  |
| prisma, @prisma/client                | 7.10.0       | npm currently tags an 8.0 release candidate as `latest`; do not install it |
| @prisma/adapter-mariadb               | 7.10.0       | Prisma 7 driver adapter for MySQL                                          |
| tailwindcss                           | 4.x          | CSS-first config in `app/globals.css`; no `tailwind.config.ts`             |
| zod                                   | 4.6.5        |                                                                            |
| react-hook-form / @hookform/resolvers | 7.89.0 / 5.x |                                                                            |
| @node-rs/argon2                       | 2.2.1        | argon2id, prebuilt binaries work on Vercel                                 |
| next-themes                           | 0.4.x        | `.dark` class plus "Match system"                                          |
| date-fns + @date-fns/tz               | 4.x / 1.x    | replaces `date-fns-tz` in the plan PDF                                     |
| resend                                | 6.32.0       |                                                                            |
| @vercel/blob                          | 2.8.0        |                                                                            |
| vitest                                | 5.0.3        |                                                                            |
| @playwright/test                      | 1.63.0       |                                                                            |

Re-check each pin when Phase 0 starts. Before using Prisma 7, read its upgrade notes
(generator, `prisma.config.ts`, driver adapter, and whether MySQL full-text search still
needs a preview flag). Read the Next 16 notes on `proxy.ts` and caching as well.

## D-15 Manual escalation — _Decided_

From the prototype: the requester, or a handler who is not the head, can escalate an
open ticket to the next level with a reason. A manual escalation creates the same
`Escalation` row the cron would. Because of the unique `(ticketId, level)` constraint,
cron and humans can never double-escalate.

---

## Open questions (carried from the plan)

1. Managed MySQL provider and region (D-11).
2. Sending domain for Resend, e.g. `servicedesk.milife.com.gh`.
3. Level-2 recipient (D-04).
4. Is the company email domain fixed, so invites can be restricted to it?
5. Which department pilots first?
6. Confirm D-01, D-03, D-05, D-06, D-07, D-08 with miLife.
