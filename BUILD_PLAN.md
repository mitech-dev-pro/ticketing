# Build plan

Ten phases. Phases 0–4 are the launchable core; 5–9 add depth. Each phase ends with
something we run, compare with the prototype, and commit. Every prompt below assumes
`CLAUDE.md` is loaded, and starts with "Plan first, then wait for my OK."

## Before Phase 0 (once)

1. Repo root contains: `CLAUDE.md`, `BUILD_PLAN.md`, `docs/` (DECISIONS, PERMISSIONS,
   PLAN.pdf), `design_handoff_milife_service_desk/` (unchanged), `scripts/`,
   `prisma/seed-data/`, `app/globals.css`, `tests/unit/permissions.matrix.ts`.
2. Remove the handoff's own `CLAUDE.md` and `BUILD_PLAN.md` from
   `design_handoff_milife_service_desk/` so there is only one of each.
3. Answer what you can from the open questions in `docs/DECISIONS.md`.

---

### Phase 0 — Foundation

> Plan first, then wait for my OK. Scaffold Next.js 16 (App Router, TypeScript strict) in the repo root, keeping the files already there. Use the exact versions in DECISIONS D-14. Tailwind 4 using the existing `app/globals.css` (do not add a tailwind config). Figtree 400–700 and JetBrains Mono 500 via `next/font`, exposed as `--font-figtree` and `--font-jetbrains-mono`. next-themes with the `class` strategy and "system". ESLint, Prettier, Husky + lint-staged. Prisma 7 with the MariaDB adapter against MySQL 8; `docker-compose.yml` with a dev and a test database (utf8mb4, UTC). `lib/env.ts` validating every variable with Zod, and `.env.example`. Stubs: `lib/db.ts` (single client, low connection limit), `lib/storage.ts`, `lib/email.ts`, `lib/permissions.ts`, `lib/sla.ts`, `lib/ids.ts`. `next.config.ts` with `output: 'standalone'`. Vitest (unit + integration against the test DB) and Playwright configured. GitHub Actions: typecheck, lint, test, `prisma validate`. Copy the logos into `public/`. No features.

**Check:** `npm run dev` shows a blank page in Figtree; `npx prisma studio` connects; CI green; a Vercel preview deploys (throwaway DB until D-11 is settled).

### Phase 1 — Data model, seed, sign-in, app shell

> Plan first, then wait for my OK. Schema for User, Session, AuthToken, Department, ServiceType, Holiday, Setting. Seed reads only `prisma/seed-data/*.json` (D-13): departments with heads, people, service catalogue with fields, settings; password from `SEED_PASSWORD`; refuse to run in production. Auth: sign-in, sign-out, httpOnly secure session cookie, sessions stored in DB and revocable, argon2id, login rate limit, forgot-password and set-password pages with hashed single-use expiring tokens, `proxy.ts` protecting the `(app)` group. Admin "Add person" (minimal) sending an invite via `lib/email.ts`. App shell: 240px navy sidebar with role-based nav, 58px header, off-canvas menu under 760px, theme toggle with "Match system". Implement `lib/permissions.ts` to pass every case in `tests/unit/permissions.matrix.ts` (write `tests/unit/permissions.test.ts` against it; ticket-shaped fixtures built from the seed JSON, since tickets arrive in Phase 2).

**Tests:** full permissions matrix; password hashing; token expiry and single use; session revocation.
**Check:** sign in as kojo.appiah (head of IT), esi.quaye (member) and ama.serwaa (admin); sidebars differ; a reset link works end to end with console email.

### Phase 2 — Create a ticket and the department inbox

> Plan first, then wait for my OK. Schema for Ticket (number PK autoincrement, set to start at 24827 in the migration SQL — D-12; `dueAt`, `firstResponseDueAt`, `pausedAt`, `pausedMs` per D-02/D-03), TicketLeg, TicketEvent. Seed the 22 sample tickets with their legs and events, recomputing deadlines with `lib/sla.ts`. `lib/sla.ts`: `computeDueAt`, `computeFirstResponseDueAt`, `percentElapsed`, `slaState`, calendar-aware (24/7 and business hours with holidays), all pure and taking `now`. `ticketService`: `create` (ticket + first leg + CREATED event + deadlines), `assign`, `pickUp` (D-08), `setPriority` (recompute from createdAt), `setStatus` (handles pause/resume). `visibleTicketsWhere(user)` plus the integration test that it agrees with `canView` for every seed user × ticket. New ticket wizard (step 1 keyword suggestions from `classifier.json`; step 2 service fields, priority, confidential default per department; draft restored on reopen). Inbox list: tabs, priority filter, "Due within 4h", inline edits per permissions, bulk bar for heads, admin department filter. Sent page.

**Tests:** deadlines for each priority on both calendars; pause and resume; priority change recomputes from createdAt; members cannot assign but can pick up; confidential tickets absent from other users' lists and counts.
**Check:** esi.quaye sends an IT request; kojo.appiah sees it under Unassigned, assigns it and changes priority.

### Phase 3 — Ticket detail, conversation, forwarding

> Plan first, then wait for my OK. Ticket page: header tags, Journey stepper from TicketLeg, deadline ring, custom fields. Conversation: replies and internal notes (hidden per PERMISSIONS), grouping within 15 minutes, system events as chips, @mentions of people and departments stored in a Mention table (confidential tickets: picker limited to people with access, no departments — D-07), signature, canned replies, draft autosave. Attachments through `lib/storage.ts` with size/MIME limits, image and PDF preview, permission-checked download route. Forward with required reason and the confidential toggle (D-07). Resolve, reopen, rating with the 1–2 star feedback dialog creating a head follow-up. Undo per D-09 including the keepalive commit route. `firstResponseAt` per D-02. Polling refresh per D-10.

**Tests:** forwarding closes and opens legs; history survives several forwards; confidential access moves with the ticket; internal notes never reach the requester; mentioned member gains view on normal tickets only.
**Check:** IT forwards the printer ticket to Facilities; the Journey shows both departments with time in each.

### Phase 4 — Deadlines, escalation, notifications

> Plan first, then wait for my OK. Requires Vercel Pro. Cron routes (every minute, `CRON_SECRET`, idempotent): 75% warning, first-response miss warning, breach → level-1 Escalation, level-2 after the window in D-04, auto-close resolved tickets after 3 days (skip rated or reopened), out-of-office reassignment. Manual escalation (D-15). Escalations page with Acknowledge. Notification table, header dropdown, mark all read. Email notifications via Resend and the 07:30 Africa/Accra digest. Admin settings for SLA targets, calendars and rule toggles.

**Tests:** `slaState` boundaries; escalation job run twice creates one escalation; manual and cron escalation cannot collide; auto-close skips rated or reopened tickets.
**Check:** set Urgent to 2 minutes, create an urgent ticket, watch it go amber, breach and escalate.

### Phase 5 — Home, Board, Calendar, Workload, Departments

> Plan first, then wait for my OK. Home per role; Board with drag-and-drop status changes writing events; Calendar of due dates; split view at ≥1180px; saved views; hover previews; Workload; Departments directory and pages; Mentions page; global search with MySQL FULLTEXT filtered by `visibleTicketsWhere`.

**Check:** every Home card links to the right filtered list; dragging a card changes status and writes an event; search never returns a ticket the user cannot open.

### Phase 6 — Tasks, time, links, merge, assets, policy lookup

> Plan first, then wait for my OK. Tasks with progress; time tracking (timer, +15m/+30m/+1h); links with automatic inverse and the Blocked tag; merge and sub-tickets with duplicate detection; asset register with history and "Report a fault"; policy and claim lookup from the stub tables.

**Check:** merging writes MERGED / MERGED_IN events on both tickets.

### Phase 7 — Knowledge base, reports, announcements, profile

> Plan first, then wait for my OK. Help Center and knowledge base with helpful votes and wizard suggestions; Reports (KPIs, volume and SLA charts, leaderboard, satisfaction, forwarding flows, CSV export, scheduled email) scoped by permissions; announcements; Profile & settings including out of office; print/PDF view.

**Check:** report numbers match a hand count on seed data; heads see only their department.

### Phase 8 — Administration, audit, compliance

> Plan first, then wait for my OK. All admin tabs from the README; every change writes AuditLog; disabling a user ends their sessions at once; inbound email-to-ticket webhook; retention jobs per settings.

**Check:** disabling a user signs them out immediately; an inbound email creates a ticket in the right department.

### Phase 9 — AI assist, polish, launch

> Plan first, then wait for my OK. AI assist (summarise, suggest reply, routing check) via the Anthropic API server-side, with "check before using" copy and no confidential content sent unless a rule allows it. Motion spec, skeletons, empty states, first-run tour per role. Accessibility pass (keyboard, focus, AA contrast in both themes). Playwright: create → assign → forward → resolve → rate. Security review, Sentry, backups confirmed, real miLife data replaces the seed.

**Check:** all end-to-end tests pass on the production-like preview; a pilot department uses it for a week.

---

## Tips

- If a phase feels big, split it and commit halfway.
- When something looks off, name the screenshot and README section to compare against.
- When a decision is missing, add it to `docs/DECISIONS.md` first, then build.
