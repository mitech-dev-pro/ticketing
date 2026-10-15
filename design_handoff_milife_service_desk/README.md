# Handoff: miLife Service Desk

## Overview
An internal ticketing system for **miLife Insurance (Ghana)**. Any staff member in any of the 12 departments can send a request to any department. Each department has a **head** who sees every request sent to the department, assigns work, handles escalations and reads reports. A department can **forward** a ticket to another department; the full journey (every department, how long it stayed there, why it moved) is kept on the ticket. Deadlines (SLAs) run per priority and escalate to the head and then the COO.

Target repo: `mitech-dev-pro/ticketing` (currently empty). Build it **step by step** using `BUILD_PLAN.md`, which breaks the work into phases with a ready-to-paste Claude Code prompt for each.

## About the design files
`prototype/MiLife Service Desk v7.dc.html` is a **design reference built in HTML**: a clickable prototype showing intended look and behaviour, using in-memory sample data. It is **not production code**. Recreate it in a real stack (see *Recommended stack*) with a database, authentication and an API. Open it in a browser (keep `support.js` and `assets/` next to it) and use the **Viewing as** switch in the sidebar to see each role.

## Fidelity
**High-fidelity.** Colours, type, spacing, copy and interactions are final. Recreate the UI closely; where the prototype fakes something (AI replies, typing indicator, email, sample data), build the real equivalent.

## Recommended stack (repo is empty)
- **Next.js 14+ (App Router) + TypeScript**, server actions / route handlers
- **PostgreSQL + Prisma**
- **Auth.js** with email + password and Microsoft-free setup (the business asked for no Microsoft sign-in and no SMS for now); add 2FA by email code later
- **Tailwind CSS** with the tokens below, **Radix UI** primitives for dialogs/menus/selects
- **Background jobs**: a cron/worker (e.g. `pg-boss` or Vercel Cron) for SLA checks, escalations, auto-close, digests, recurring tickets
- **Email**: SMTP (Resend/Postmark) for notifications, digest and email-to-ticket (inbound webhook)
- **File storage**: S3-compatible bucket for attachments
- **AI assist**: Anthropic API, server-side only

## Roles and permissions
| Role | Sees | Can do |
|---|---|---|
| **Staff (member)** | Tickets they raised, tickets assigned to them, tickets where they or their department are @mentioned | Create tickets to any department; reply; rate; reopen |
| **Department head** | All tickets currently with their department (plus ones that passed through), confidential ones included for their department | Assign, change priority/status, forward, bulk actions, acknowledge escalations, workload, department reports, post announcements |
| **Admin** (Ama Serwaa in sample) | Everything across all departments | Everything + Administration (departments/heads, people, SLA, rules, templates, channels, confidentiality/retention, audit log) |

Confidential tickets (default for HR, Legal, Compliance) are visible only to requester, assignee, that department's head and admins.

## Data model (minimum)
- `Department` id, name, hue (colour), headUserId, emailAlias, confidentialByDefault
- `User` id, name, email, branch (Achimota HQ / Kumasi / Takoradi), departmentId, role (member|head|admin), phone, ext, signature, useSignature, photoUrl, theme, density, notificationPrefs (json)
- `OutOfOffice` userId, until, delegateUserId
- `ServiceType` (catalogue) id, departmentId, name, description, defaultPriority, needsApproval, fields (json: label, type text|select|date, required, options), attachmentRequired
- `Ticket` id (`MLT-24826` format), subject, description, requesterId, departmentId (current), assigneeId, serviceTypeId, priority (urgent|high|medium|low), status (open|progress|pending|resolved|closed), channel (Portal|Email|Teams|WhatsApp), confidential, fields (json), parentId, mergedIntoId, assetId, policyNumber, createdAt, dueAt, firstResponseAt, resolvedAt, csat, followup (json)
- `TicketLeg` ticketId, departmentId, inAt, outAt, byUserId, reason — one row per department the ticket visits (drives the Journey)
- `TicketEvent` ticketId, type (created|msg|note|forwarded|assigned|escalated|ack|status|priority|resolved|reopened|rated|feedback|followup|merged|mergedin|child|ooo|autoclosed|task|time|linked), byUserId, body, meta (json), mentions (json: people[], departments[]), createdAt — append-only; this is also the audit log
- `Attachment` eventId, name, size, mime, url
- `Task` ticketId, text, done, order
- `TimeEntry` ticketId, userId, minutes, createdAt
- `TicketLink` fromId, toId, type (blocked_by|blocks|related_to) — always create the inverse
- `Escalation` ticketId, level (1 head, 2 COO), at, acknowledgedAt, acknowledgedBy
- `Article` (knowledge base) id, departmentId, title, excerpt, body, updatedAt, views, helpful
- `Template` id, name, departmentId, serviceTypeId, priority, subject, body, repeat (never|weekly|monthly|quarterly), nextRunAt, active
- `Announcement` id, level (outage|info), title, body, audience (All staff|branch|department), ticketId, byUserId, createdAt, endedAt
- `SavedView` userId, name, filters (json)
- `Asset` id (`MLA-LT-0142`), type, model, ownerDepartmentId, holderUserId, location, status, warranty
- `Policy` (lookup, read-only integration later) number, product, holder, premium, payMethod, since; claim number → policy
- `Setting` key/value (SLA targets, rules toggles, retention periods, integrations)

## SLA, escalation and rules
| Priority | First response | Resolve within | Colour |
|---|---|---|---|
| Urgent | 30 min | 4 h | `#d2452f` |
| High | 1 h | 8 h | `#c27412` |
| Medium | 4 h | 1 day | `#3b66b5` |
| Low | 8 h | 3 days | `#7d8095` |

- Clock starts at creation and **keeps running across forwards** (the requester's real wait).
- Remaining time colour: normal → amber at **75% elapsed** (assignee warned) → red "Breached" at 100%.
- **Level 1** escalation at breach → department head (must acknowledge). **Level 2** if still unresolved after a further window → COO/admin.
- Changing priority recalculates `dueAt` from `createdAt`.
- **Auto-close** resolved tickets after 3 days without rating/reopen (toggle).
- Rules toggles in Admin → Forwarding & mentions: auto-close, mentioned departments can reply, etc. (see prototype).
- Out of office: on enable, move the user's open tickets to the delegate (log `ooo` event); new assignments go to delegate until `until`.

## Screens / views
Layout: fixed **240px navy sidebar** (`#12143a`) + main column. Header 58px white with global search, dark-mode toggle, notifications. Below 760px the sidebar becomes an off-canvas ☰ menu (264px). Main background `#f4f5f8`. Page padding 22px 24px 40px; page title 24px/700, letter-spacing −0.02em; subtitle 14px `#6b6f88`.

1. **Sign in** — email + password, "Forgot password", miLife lockup on navy panel. No Microsoft / SMS options.
2. **Home** (default landing for every role) — date, greeting ("Good morning, Kojo"), role · branch; 4 clickable stat cards (Assigned to you · Due in 24h (red if any overdue) · Your open requests · Escalations to acknowledge [heads/admin] or Mentions [staff]); cards grid `repeat(auto-fit,minmax(340px,1fr))`: Needs you, Due in next 24 hours, Your requests, Recent updates, Low ratings to follow up (heads), Announcements. Each row: 7px dept colour square, title (600), sub line 12px muted, right-aligned mono value (SLA coloured).
3. **Help Center** — search, popular guides, departments grid, "+ New ticket".
4. **Departments & services** — directory of 12 cards (4px colour top bar, name, head avatar, services list, team/open counts) + service search across the catalogue. **Department page**: header with colour bar, head, email alias, extension, stats (Open now, Deadlines met, Services), "New request to X"; Services list (description, target time, field count, "Needs approval"), Guides, Team (away badges), Your requests to X.
5. **Inbox** (heads/members of a department; admin = all, filter by dept in sidebar) — tabs Open / Unassigned / Assigned to me / Resolved; mode switch **List / Board / Calendar** (navy segmented control, active teal `#00bab3`); filter row: priority select, "Due within 4h" chip, saved **Views** chips (defaults "Due soon", "Urgent"; + Save current view; × delete). List columns `34px minmax(0,1fr) 92px 140px 150px 130px 118px`: checkbox (heads), ticket (id mono, subject, tags: escalation, Blocked, Confidential, sub-ticket), priority (inline select), department, assignee (inline select, "away" badge), status (inline coloured select), deadline (mono, coloured). Hover a row 450ms → preview card (dept bar, status, last message 3-line clamp, route, tasks, SLA). Bulk bar (navy) when rows selected: Assign to…, Forward to…, Mark resolved, Clear. Empty "Assigned to me"/"Unassigned" → confetti + "Inbox zero. Nice work."
   - **Board**: 4 columns Open / In progress / Awaiting requester / Resolved (last 7 days), drag to change status; drop target turns `#e8f7f6` with teal dashed border; dropped card plays a land/pulse animation.
   - **Calendar**: month grid Mon–Sun, due items (time · subject, border = priority colour, red fill if overdue), dashed purple repeating requests, max 3 per day + "+N more", prev/next/Today.
   - On wide screens (≥1180px) opening a ticket from the inbox shows a **310px list on the left** (split view).
6. **Ticket detail** — main column + right aside.
   - Header: id, status, priority, department chip, channel, escalation/Confidential/Blocked tags; subject 21px/700; parent / merged-into links; possible-duplicate panel (merge).
   - **Status bar card**: Journey stepper (dot per department visited + final Resolved step; current dot pulses teal; past dots filled `#00a39c`; line between) and a **deadline ring** (54px conic gradient by % elapsed, label %, remaining time mono, due date).
   - Low-rating follow-up banner (heads): stars, reasons, "Reopen to reply", "Mark followed up".
   - Custom fields grid, sub-tickets list with progress.
   - Conversation (max-width 820px): bubbles for messages/notes (notes yellow), grouped when same author within 15 min; system events as small chips; attachments as cards (image thumbnail 112px or file icon); typing indicator.
   - Composer: Reply / Internal note tabs, canned replies, ⎘ Attach, @ mention (people and departments), pending attachments chips, "Draft saved" indicator, Send. Signature appended to replies.
   - Aside sections (each `padding:16px 20px`, bottom border): AI assist (Summarise · Suggest reply · Check routing), Actions (assign, priority, forward with reason, resolve, merge, add sub-ticket, ⎙ Print/PDF), Tasks (progress bar, checklist), Time logged (start/stop timer, +15m/+30m/+1h, entries), Linked tickets, Requester profile (avatar, role, dept, branch, stats, recent requests), Asset, Policy lookup, Related tickets, Watching departments.
   - Requester view: resolved banner with 1–5 star rating; 1–2 stars opens "Sorry it wasn't better" dialog (reasons chips + note) → creates follow-up for head.
7. **New ticket wizard** (modal 640px) — Step 1: "What do you need help with?" textarea → live suggested department + category (keyword match) with alternatives, matching guides, templates. Step 2: department, category, priority, subject, description, service-specific fields (required marked *), required attachment, asset picker (IT/Facilities), Confidential toggle, Repeat. Unsent draft restored on reopen.
8. **Sent** — requests I/my department sent, with journey.
9. **Escalations** (heads/admin) — list with level and Acknowledge.
10. **Mentions** — tickets where I/my department were @mentioned.
11. **Workload** (heads) — column per person: open count, load bar (5-ticket guide; amber ≥3, red ≥5), away notice, breached count, tickets sorted by urgency.
12. **Assets** — register table, expandable rows with ticket history, "Report a fault".
13. **Knowledge base** — articles by department, article view with helpful votes.
14. **Reports** — scope (dept or all), period; KPI cards, volume chart (bars grow in), deadlines met per department (bars grow in), SLA leaderboard, satisfaction trend + comments, forwarding flows, schedule email report, export CSV.
15. **Administration** tabs — Departments & heads · People & roles · SLA & escalation · Forwarding & mentions · Templates & recurring · Channels & alerts (email aliases per dept, Teams/WhatsApp toggles) · Confidentiality & retention · Audit log (filter, export CSV).
16. **Profile & settings** — photo upload, phone, extension, reply signature + toggle, theme (Light/Dark/Match system), density, notification prefs, out of office.
17. **Global**: notifications dropdown (unread dot, mark all read, daily digest preview), announcement banner under header (Outage red / Notice blue, dismiss, "View MLT-…"), toasts (pill, ✓ icon; **Undo** for 6s after send, resolve, forward), first-run tour per role (4 steps, bottom-right navy card), global search with related history.

## Interactions & motion
- Page enter: fade-up 6px, 300ms ease. Modals: fade backdrop 180ms + scale .98→1 / translateY 10px, 240ms `cubic-bezier(.2,.8,.2,1)`.
- Ticket open: slide in from right 22px, 320ms. New conversation item: slide in 450ms.
- Skeleton shimmer while lists load (1.3s linear).
- Toast: pop up from bottom with slight overshoot (`cubic-bezier(.2,.9,.3,1.25)`), icon bounce.
- Charts: bars `scaleY`/`scaleX` from 0, 800–900ms.
- Respect `prefers-reduced-motion` (disable all).

## Design tokens
**Brand**: navy `#12143a`, navy-2 `#1b1e4d`, teal `#00bab3`, deep teal (primary buttons) `#007a74`, teal hover `#005d58`.
**Light neutrals**: bg `#f4f5f8`, surface `#ffffff`, ink `#14162b`, ink-2 `#3d4160`, muted `#6b6f88`, faint `#8a8ea6`, line `#e3e5ec`, line-2 `#eceef3`/`#f1f2f6`, hover `#f7f8fb`.
**Dark**: bg `#0e1029`, surface `#171a3a`, ink `#e8eaf6`, ink-2 `#c3c7e6`, muted `#9ea3c7`, faint `#8388b5`, line `#2a2e5c`, line-2 `#23264f`.
**Status** (bg / text): Open `#e6edfb`/`#2b54a3` · In progress `#dff5f3`/`#00625c` · Awaiting requester `#fbf0dc`/`#86580a` · Resolved `#e4f2e2`/`#36692e` · Closed `#ecedf1`/`#585c72`. Danger tint `#fdecea`/`#a3301f`. Notes `#fffaf0`. Merge purple `#5a43a8` on `#f8f6fd`.
**Department colour**: `oklch(0.6 0.11 <hue>)` with hues — Claims 30, Customer Service 180, Underwriting 265, IT 235, HR 325, Finance 85, Compliance 295, Operations 205, Sales & Distribution 55, Legal 10, Facilities 140, Marketing 350. **Avatar**: `oklch(0.5 0.08 <hash(name)%360>)`.
**Type**: Figtree 400/500/600/700 (UI); JetBrains Mono 500 for ids, timers, labels. Base 13.5px; labels 10.5px mono uppercase letter-spacing .06em; body in conversation 14px/1.62; page title 24px; ticket subject 21px.
**Radius**: 5–6px chips/badges, 7–8px inputs/buttons, 10–12px cards, 999px pills. **Shadows**: cards none (1px border); popovers `0 14px 40px rgba(18,20,58,.16)`; modals `0 20px 60px rgba(0,0,0,.22)`.
**Spacing**: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 20 / 24 px.

## Sample organisation (seed data)
12 departments with heads: Claims – Abena Osei · Customer Service – Adwoa Nyarko · Underwriting – Yaw Darko · IT – Kojo Appiah · HR – Gifty Mensah · Finance – Felix Owusu · Compliance – Selasi Amegah · Operations – Isaac Boadu · Sales & Distribution – Nana Agyei · Legal – Mawuli Dzah · Facilities – Kwabena Asare · Marketing – Akua Danso. Admin: Ama Serwaa. Branches: Achimota HQ, Kumasi, Takoradi. Service catalogue, form fields, canned replies, templates, articles, assets and sample tickets are all in the prototype's logic section (search `const DEPTS`, `FORMS`, `CATD`, `TEMPLATES`, `CANNED`, `ASSETS`, `ARTICLES`, `mk({id:`). Replace with real miLife data before launch.

## Assets
`assets/milife-lockup.png` (colour logo), `assets/milife-lockup-white.png` (on navy), `assets/milife-symbol.png` / `milife-symbol-t.png` (symbol, transparent) — supplied by miLife.

## Files
- `README.md` — this spec
- `BUILD_PLAN.md` — phased build with Claude Code prompts
- `CLAUDE.md` — drop into the repo root so Claude Code keeps these rules in every session
- `prototype/` — the HTML reference (open `MiLife Service Desk v7.dc.html`)
- `screenshots/` — 17 captures of the prototype at a ~1150px-wide viewport, for quick visual reference: 01 sign-in · 02 home · 03 inbox list · 04 inbox board · 05 inbox calendar · 06 ticket detail · 07 new ticket wizard (step 1) · 08 workload · 09 reports · 10 department page · 11 help center · 12 knowledge base · 13 assets · 14 escalations · 15 profile & settings · 16 home (dark theme) · 17 admin audit log. They are smaller than a typical desktop, so some layouts look tighter than intended — the prototype and this README are the source of truth for sizes.
- `assets/` — logos
