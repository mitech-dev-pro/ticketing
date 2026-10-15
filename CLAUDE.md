# miLife Service Desk — project rules

Internal ticketing for miLife Insurance (Ghana): 12 departments, three roles (member,
head, admin), tickets that can be forwarded between departments and keep their journey.

## Sources of truth, in priority order

1. `docs/DECISIONS.md` — agreed decisions. Wins over everything below.
2. `docs/PLAN.pdf` — context, stack, architecture rules, data model, phases.
3. `docs/PERMISSIONS.md` and `tests/unit/permissions.matrix.ts` — access rules.
4. `design_handoff_milife_service_desk/README.md` — screens, behaviour, tokens, copy.
5. `design_handoff_milife_service_desk/screenshots/` and the v7 prototype — visual
   reference only. Never import, copy or ship prototype code.

The handoff README mentions PostgreSQL, Auth.js, pg-boss and S3. **Ignore those.** Our
stack is below.

## Stack (do not substitute)

Next.js 16 App Router · TypeScript strict · MySQL 8 · Prisma 7 with the MariaDB driver
adapter · Zod 4 · react-hook-form · Tailwind 4 (CSS-first, tokens in `app/globals.css`) ·
Radix via restyled shadcn/ui · next-themes · own database sessions with argon2id (no
Auth.js, email + password only, no Microsoft sign-in, no SMS) · Vercel Cron →
`/api/cron/*` · Resend behind `lib/email.ts` · Vercel Blob behind `lib/storage.ts` ·
date-fns + @date-fns/tz (display in Africa/Accra, store UTC) · Vitest · Playwright.
Pinned versions are in `docs/DECISIONS.md` (D-14). Do not upgrade without asking.

## Architecture rules

- Every write goes: UI → Server Action or route handler → Zod schema
  (`lib/validation/`) → session + `lib/permissions.ts` → service in `lib/services/` →
  `prisma.$transaction`. The UI never writes through Prisma directly. Nothing trusts
  the client.
- Server Actions return `{ ok: true, data }` or `{ ok: false, fieldErrors }`. Forms reuse
  the same Zod schema on the client.
- `lib/permissions.ts` is the only place access rules live. Every list, count, badge,
  search, report and export builds on `visibleTicketsWhere(user)`. Never write a ticket
  query without it.
- Every ticket change writes its `TicketEvent` in the same transaction. Events are
  append-only: never update or delete them.
- Forwarding requires a reason, closes the open `TicketLeg` (`outAt`), opens a new leg,
  clears the assignee and writes a `FORWARDED` event, all in one transaction.
  Confidentiality is sticky across forwards (D-07).
- SLA maths are pure functions in `lib/sla.ts` that take `now` (and a calendar) as
  arguments. Deadlines are `createdAt + target + pausedMs` on the ticket's calendar; the
  clock pauses only in Awaiting requester (D-01, D-03).
- Cron routes check `CRON_SECRET`, run as the system user through the same services, and
  must be idempotent (a missed or doubled run does no harm).
- Admin changes write an `AuditLog` row (who, what, before, after).
- Filterable or reportable values get real columns. JSON columns hold display-only data.
- Only `lib/storage.ts`, `lib/email.ts` and `vercel.json` may know about Vercel (D-11).

## Conventions

- Ticket ids display as `MLT-24827`, asset ids as `MLA-LT-0142`; format and parse only in
  `lib/ids.ts`.
- British English copy, taken from the prototype.
- Department colour: `oklch(0.6 0.11 <hue>)` via the `bg-dept` utility and `--hue`.
- Light and dark themes and `prefers-reduced-motion` on every screen.
- No `any` in domain code.
- Seed and test data use `@milife.test` addresses only.

## How we work

- One phase at a time, in the order in `BUILD_PLAN.md`.
- Each phase: show a plan and wait for OK → schema and services with tests → UI against
  the matching screenshot → run, review, commit.
- Permissions, SLA and forwarding changes always come with tests.
- If a decision is missing or two sources disagree, stop and ask. Do not guess.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
