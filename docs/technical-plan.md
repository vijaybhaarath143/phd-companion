# PhD Companion — Frontend & Backend Technical Plan

**Version:** 1.0 · **Date:** 14 November 2026
**Builds on:** PhD Companion PRD v1.0 (13 Nov 2026), the agreed Product & Engineering Plan v1.0 (14 Nov 2026), the user flow (Proto Draw 128) and the screen designs (Claude Design canvas "PhD Companion — screens").
**Audience:** whoever builds it (you, Codex, or another engineer).

---

## 1. What we are building, in one paragraph

One private web app (works on desktop and phone, installable to the home screen) where a PhD scholar records what happened, organises it into projects, manuscripts, experiments, courses and tasks, and finds it again later. One user today. Later her guide and collaborators sign in to see only what she shares, and she can use the same data from ChatGPT/Codex through an MCP connection. The two things that must never go wrong: **her data stays private**, and **history is never silently rewritten** (no invented dates, no lost earlier versions, no automatic statuses).

## 2. Stack (decided)

| Layer | Choice | Why |
|---|---|---|
| App framework | Next.js (App Router) + TypeScript, one deployable app | Server components for reads, server actions for writes; runs on any Node host |
| UI | Tailwind CSS + shadcn/ui (Radix) + lucide icons, Geist font | Matches the screen designs; accessible primitives; code lives in the repo |
| Forms & validation | react-hook-form + Zod; the same Zod schemas on client and server | One source of truth for rules |
| Database | Postgres on Supabase (Mumbai region) | Relational data, row-level security, managed backups |
| DB access | postgres.js tagged SQL + plain SQL migrations (Supabase CLI) | Plain SQL, typed results; no lock-in. *(Changed from Drizzle during the first build: its schema generator could not represent the auth references, search column and checks cleanly.)* |
| Auth | Supabase Auth, email one-time codes, custom SMTP (Resend or Amazon SES) | No passwords; same identities later for guide and MCP |
| Files | Supabase Storage, private bucket, signed URLs | Access rules in the database |
| Hosting | Vercel (Hobby to start) | Simple; Next.js is portable if we move |
| Backups | Supabase daily backups + nightly off-site copy (DB dump + files) to Backblaze B2 or Cloudflare R2 | Supabase backups don't include files |
| Later | MCP endpoint (`/api/mcp`, MCP TypeScript SDK, OAuth via Supabase Auth); sharing | Same domain layer, same access rules |

Deliberately **not** used: microservices, a separate search engine, Redis, a client-side data cache library, a global state library, custom auth, Supabase Edge Functions for business logic.

## 3. Architecture

```
Browser (desktop / phone)
  │  Server Components render pages      Server Actions for writes
  ▼
Next.js app on Vercel
  ├─ app/            routes & screens (thin)
  ├─ components/     shadcn/ui + app components
  └─ server/
       ├─ domains/   ONE place for every business rule
       │             (entries, projects, manuscripts, experiments, tasks,
       │              goals, academics, enquiries, attachments, home, search, export)
       ├─ db/        Drizzle schema + withUser() transaction helper
       └─ auth/      session → user id
  │  every query runs inside withUser(): a transaction that sets the
  │  signed-in user's identity, so Postgres row-level security applies
  ▼
Supabase: Postgres (RLS on every table) · Auth (email codes) · Storage (private)
  ▲
  └─ later: /api/mcp (ChatGPT / Codex) → same server/domains → same RLS
```

**Rule of thumb:** pages and the future MCP endpoint never touch the database directly. They call `server/domains/*`, which validates, applies the rules (date precision, revisions, no auto-status) and writes inside `withUser()`.

## 4. Repository layout

```
scholar-app/
  app/
    (auth)/sign-in/page.tsx            1.1 Sign in
    (auth)/verify/page.tsx             1.2 Enter code
    (onboarding)/welcome/…             1.3–1.5 Onboarding (3 skippable steps)
    (app)/layout.tsx                   Sidebar (desktop) + bottom bar (phone) + Quick Add
    (app)/page.tsx                     2.1/2.2 Home (first-day and populated are one page)
    (app)/journal/page.tsx             3.1 Journal (search, filters, Needs a date)
    (app)/journal/[id]/page.tsx        3.2 Entry
    (app)/research/page.tsx            project switcher → redirects to last project
    (app)/research/projects/[id]/…     4.1 Project
    (app)/research/manuscripts/[id]/…  4.2 Manuscript
    (app)/research/experiments/[id]/…  4.3 Experiment
    (app)/planner/page.tsx             5.1 Planner (?view=tasks|calendar|goals)
    (app)/academics/page.tsx           5.2 Academics
    (app)/settings/page.tsx            5.3 Settings
    api/export/route.ts                streamed export download
    api/files/[id]/route.ts            auth-checked redirect to a short-lived signed URL
    api/mcp/route.ts                   later
  components/
    ui/                                shadcn/ui generated components
    app/                               QuickAdd, PartialDateInput, SaveStatus, …
  server/
    db/schema/*.ts  db/client.ts  db/with-user.ts
    domains/<domain>/{service.ts, queries.ts, schema.ts}
    auth/session.ts
  lib/
    dates/  (partial dates, time zone, period overlap)
    credits/ (credit summary maths)
  supabase/
    migrations/*.sql                   tables, constraints, RLS, functions, indexes
    seed.sql                           synthetic data only (never real research)
  tests/
    unit/  db/  e2e/
  scripts/
    backup.sh  restore-drill.sh
  docs/
    technical-plan.md (this file)
```

---

## 5. Frontend plan

### 5.1 Rendering and data flow

- **Reads:** React Server Components call domain query functions directly (no internal REST layer). Pages are dynamic and per-user; responses send `Cache-Control: private, no-store`.
- **Writes:** Server Actions call domain services and return a typed result:
  `{ ok: true, data } | { ok: false, error: { kind: 'validation' | 'conflict' | 'not_found' | 'retry', message, fields? } }`.
  After success the action calls `revalidatePath` for affected screens (e.g. saving an entry revalidates Journal, Home and its project).
- **Client components only where needed:** Quick Add, autosaving forms, date input, tabs/toggles, search box. Everything else is server-rendered HTML.
- **No offline mode.** Online-first as agreed. Unsaved text stays in the open page; nothing is written to device storage.

### 5.2 Screen → route → main components

| Screen (design canvas) | Route | Key components | Data it reads |
|---|---|---|---|
| 1.1 Sign in | `/sign-in` | `Card`, `Input`, `Button` | — |
| 1.2 Enter code | `/verify` | `InputOTP` (shadcn), resend button with cooldown | — |
| 1.3–1.5 Onboarding | `/welcome?step=1..3` | step indicator, `Input`, `Select`, `MonthYearInput` | profile |
| 2.1/2.2 Home | `/` | `NeedsAttention`, `WorkingOn`, `CreditSummaryCard`, `ComingUp`, `RecentEntries`, `EmptyState` | `home.getOverview()` (one query bundle) |
| 2.3 Quick Add | global (dialog on desktop, bottom sheet on phone) | `Dialog` / `Drawer` (vaul), `ToggleGroup`, `PartialDateInput`, `ProjectSelect` | projects list |
| 3.1 Journal | `/journal?q=&from=&to=&category=&status=&project=` | search `Input`, filter `Popover`s, `TimelineMonth`, `NeedsDateList` | `search.entries()` with cursor |
| 3.2 Entry | `/journal/[id]` | `AutosaveForm`, `SaveStatus`, typed sections (event/feedback/enquiry) | entry + extension |
| 4.1 Project | `/research/projects/[id]` | project pills, `Tabs`, task list, evidence card | project bundle |
| 4.2 Manuscript | `/research/manuscripts/[id]` | `PhaseCard` (change vs earlier change), `FeedbackList`, `SubmissionList`, `PhaseHistory` | manuscript bundle |
| 4.3 Experiment | `/research/experiments/[id]` | status chips, `AutosaveForm` sections, `VersionList`, `BlockerList` | experiment + revisions |
| 5.1 Planner | `/planner?view=` | `TaskList` (checkbox, Waiting badge), `MonthCalendar` (read-only), `GoalList` | tasks / calendar feed / goals |
| 5.2 Academics | `/academics` | `CreditSummary`, courses `Table`, `RecognitionDialog`, milestones, enquiries | academics bundle |
| 5.3 Settings | `/settings` | profile form, reminder checkbox, export button, archive/trash, sign out | profile, counts |

### 5.3 Shared app components (built once, used everywhere)

- **`PartialDateInput`** — three-way toggle *Exact date / Month only / Not sure yet*; returns `{ date, precision }`. Never fills in a day the user didn't give.
- **`PartialDate`** (display) — "14 Nov 2026", "January 2027 · day not known", "No date yet". Month-only targets show "This month, no exact day" / "Past target month".
- **`AutosaveForm` + `useAutosave`** — debounced save (≈1.5 s after typing stops, and on blur); sends `expectedVersion` and an `editSessionId`; shows **Saving… / Saved / Couldn't save (Retry · Copy text)**; warns before leaving with unsaved text; on a version conflict shows "Changed in another tab — reload or compare", never overwrites.
- **`SaveStatus`** — the small indicator in the designs.
- **`QuickAdd`** — opened from sidebar, phone + button, or a project (pre-selects that project, visibly, removable). Generates the record's UUID on the client so a double-click or retry can't create two entries. Supports "Save & add another".
- **`EmptyState`**, **`StatusBadge`** (amber only for "needs attention"), **`ProjectSelect`**, **`MonthCalendar`**.

### 5.4 Layout, responsiveness, accessibility

- Desktop: left sidebar (Quick Add, Search, Home, Journal, Research, Planner, Academics, Settings). Phone (<768px): sidebar hidden; bottom bar Home · Journal · **+** · Planner · More, as in screens 2.4/2.5.
- Every page has the viewport meta tag (found missing in the design check; must not regress).
- shadcn/Radix gives keyboard and screen-reader behaviour; we add: visible focus rings, `aria-live` on save status and form errors, 44px touch targets, 4.5:1 text contrast (zinc-500 on white minimum; zinc-600 on grey backgrounds).
- Installable: web app manifest + icons. No service worker caching of private pages.

### 5.5 Dates and time zone on the client

- Calendar dates (activity dates, due dates) are plain dates with a precision — **never** converted through time zones.
- "Today" and "overdue" are computed on the server using the profile's time zone (default Asia/Kolkata) so the phone and laptop agree.
- Timestamps (created, updated, recorded-at) are UTC in the database and shown in the profile's time zone.

---

## 6. Backend plan

### 6.1 Conventions used by every table

| Convention | Detail |
|---|---|
| Primary keys | `id uuid` — generated by the client for creates (idempotent retries), otherwise `gen_random_uuid()` |
| Ownership | `owner_id uuid not null default auth.uid()` on **every** table, including child tables |
| Same-owner links | Composite foreign keys: parent has `unique (id, owner_id)`; child references `(parent_id, owner_id)`. The database itself refuses cross-user links |
| Concurrency | `version int not null default 1`; updates use `where id = $1 and version = $2` and bump the version; 0 rows → conflict |
| Timestamps | `created_at`, `updated_at` (`timestamptz`, trigger-maintained) |
| Removal | `archived_at` (hidden, kept) and `deleted_at` (Trash, purged after 30 days) |
| Provenance | `created_via text check (in ('app','chatgpt','codex','import'))`, `updated_via` |
| Partial dates | Pair of columns: `<x>_date date`, `<x>_precision date_precision ('day','month','none')`. Constraint: `month` ⇒ stored as the 1st (display never shows the 1st); `none` ⇒ date is null. Generated columns `<x>_from`, `<x>_to` give the possible range for period filters |

### 6.2 Data model

**People and settings**
- `profiles` — `user_id` (PK → `auth.users`), `display_name`, `university`, `department`, `guide_name`, `programme_start` (+precision), `timezone` (default `Asia/Kolkata`), `reminders_enabled`.

**Entries (the Journal) and their typed extensions**
- `entries` — `title`, `category` (research writing, literature review, experiment, guide meeting, coursework, conference/workshop, training, administrative, competition, achievement, research decision, reflection), `kind` (`note | experiment | feedback | enquiry | event | meeting | decision`), `entry_date` (+precision), `status` (nullable: `planned | done | postponed | cancelled` — fills the PRD's JRN-03 gap; never inferred from the date), `description`, `people` (free text), `outcome`, `skills_learned` (fills EVT-04), `project_id` (nullable), search vector (generated).
- `experiments` (1:1 with an entry) — `status` (`planned | in_progress | completed | inconclusive | unsuccessful | paused`), `objective`, `materials`, `procedure`, `observations`, `interpretation`, `outcome`, `next_steps`, `last_edit_session_id`.
- `experiment_revisions` — `entry_id`, `revision_no`, the snapshot of every experiment field, `captured_at`, `edit_session_id`. Read-only (no update/delete policy).
- `feedback` (1:1 with an entry) — `source`, `received_via`, `requested_changes`, `responsible_person`, `deadline` (+precision), `resolution_status` (`open | resolved`), `resolved_at`, `resolution_note`, `manuscript_id` (nullable).
- `enquiries` (1:1) — `office`, `contact`, `response`, `follow_up_date`, `status` (`open | waiting | closed`), `closed_at`. Never auto-closes.
- `events` (1:1) — `organiser`, `location`, `registration` (`interested | registered | not_registered`), `participation` (`unknown | attended | presented | did_not_attend | cancelled`), `presentation_title`, `award` (text; evidence optional — the award is explicit, the certificate is not required), `submission_outcome` (for competitions, e.g. "Idea submitted").

**Research**
- `projects` — `title`, `type`, `status` (`proposed | planning | in_progress | paused | completed`), `objective`, `description`, `start_date`/`target_date` (+precision).
- `manuscripts` — `project_id`, `title`, `article_type`, `authors`, `current_phase` (the 10 phases), `stopped_reason` (`withdrawn | abandoned`, only when phase = stopped), `doi`, `publication_url`.
- `manuscript_phase_events` — `manuscript_id`, `phase`, `effective_date` (+precision), `recorded_at`, `kind` (`change | earlier_change | correction`), `corrects_event_id`, `note`. **Only `change` moves `current_phase`.** `earlier_change` adds history only. Rows are never edited; corrections are new rows.
- `submissions` — `manuscript_id`, `attempt_no`, `journal_name`, `manuscript_ref`, `planned_date`, `submitted_date` (+precision), `status` (`planned | submitted | under_review | revise | rejected | accepted | withdrawn`), `decision_date`, `closed_at`. Rejection closes the attempt; the manuscript carries on.
- `submission_rounds` — revision rounds within one attempt: `round_no`, `decision`, `decision_date`, `response_sent_date`, `notes`.
- `blockers` — `experiment_entry_id` or `project_id`, `category` (equipment, procurement, protocol, sample preparation, inconsistency, other), `description`, `opened_on`, `resolved_on`. Completing a task never resolves a blocker.

**Planning**
- `tasks` — `title`, `status` (`todo | doing | waiting | done | cancelled`), `priority` (`normal | important`), `due_date` (exact only, nullable), `notes`, `project_id`, `origin_entry_id`, `manuscript_id`, `course_id`, `waiting_reason`, `waiting_on_task_id` (trigger rejects self-reference and cycles), `completed_at`.
- `goals` — `title`, `horizon` (`week | month | semester | year`), `period_start`, `period_end`, `outcome` (`open | achieved | dropped`); `goal_tasks` (goal ↔ task).

**Academics**
- `requirements` — `label` ("First-year coursework"), `period_label`, `required_credits` (nullable).
- `courses` — `name`, `provider`, `credits` (nullable — unknown ≠ 0), `status` (`planned | enrolled | completed | dropped`), `enrolled_on`, `course_start`/`course_end` (+precision), `completed_on`.
- `credit_recognitions` — `course_id`, `amount` (can be partial), `recognised_on` (+precision), `reference`. Never created automatically.
- `milestones` — `title`, `project_id` (nullable — covers the PRD's project milestones gap), `target_date` (+precision), `status` (`not_started | done | skipped`), `done_on` (+precision).
- `regulations` — `title`, `source`, `applies_to`, linked attachments (fills ACD-05).

**Files and later features**
- `attachments` — `parent_type`, `parent_id`, `kind` (`file | link`), `storage_path`, `url`, `filename`, `mime_type`, `size_bytes`, `sha256`, `status` (`pending | verified | failed`), `replaced_by_id` (replacing keeps the old reference).
- Later: `shares` (`resource_type`, `resource_id`, `grantee_email`, `grantee_user_id`, `role viewer|commenter`, `revoked_at`) and `comments`.
- `change_log` — table, record id, action, `via`, time. **No research text**, so it can be kept for provenance and recovery checks.

### 6.3 Access control (row-level security)

- RLS enabled on every table, including `attachments` and `storage.objects`.
- All policies call one function: `app.can_read(owner_id)` / `app.can_write(owner_id)`. Today: `owner_id = auth.uid()`. Later, sharing adds one clause (`or exists (select 1 from shares …)`) in that one function.
- No `delete` policy on `experiment_revisions`, `manuscript_phase_events` or `change_log`.
- Any view uses `security_invoker = true`; otherwise views bypass RLS.
- **Sign-ups are disabled.** Her account is created by invite. Later, a share invitation is what creates a guide's account.

### 6.4 How requests reach the database

- postgres.js over Supabase's connection pooler (transaction mode); dates are kept as plain `YYYY-MM-DD` strings so they never shift with time zones.
- `withUser(session, fn)`: `begin` → `set local role authenticated` → `select set_config('request.jwt.claims', <claims>, true)` → run `fn` → `commit`. RLS therefore applies to app code exactly as it would to the browser.
- The service-role key exists only in migrations and the backup/restore scripts — never in the Next.js runtime.
- Domain services own transactions for multi-row changes (e.g. "record feedback + create 3 tasks", "change phase + write phase event").

### 6.5 Rules that live in the domain layer (and are tested)

| Rule | Where |
|---|---|
| Never infer completion from a date; past events can be cancelled; future dates *suggest* "Planned" but the user decides | `entries.service` |
| Experiment revisions: on the first change to tracked fields in a **new edit session**, snapshot the previous values into `experiment_revisions`. Typing within one session is grouped; earlier acknowledged versions are never overwritten | `experiments.service` |
| "Record an earlier change" never moves `current_phase` | `manuscripts.service` |
| Rejection closes a submission; a new journal = new attempt; Accepted and Published are separate phases | `manuscripts.service` |
| Credit summary = known subtotals + list of courses with unknown credits; completed and recognised are never added together; marked incomplete when any value is unknown | `lib/credits` + `academics.queries` |
| Task cycle and self-reference rejected | DB trigger + `tasks.service` |
| Inconsistent links never silently reassign a task to another project | `tasks.service` |
| A task created for an existing deadline links to it, so the calendar shows it once | `planner.queries` |

### 6.6 Derived views (computed on read, never stored)

- **Home** (`home.getOverview`): overdue tasks (due before *today in her time zone*, not done/cancelled), waiting tasks, open feedback grouped by manuscript, enquiries whose follow-up date has arrived, open blockers, count of undated entries, credit incompleteness; working-on projects with factual counts; next dated or month-only items; last 5 entries. Every list is bounded and links to the source record.
- **Calendar feed**: union of dated tasks, planned entries, milestones, submission dates and enquiry follow-ups for the month; month-only items in a "This month, no exact day" list; undated items excluded.
- **Period review**: Journal filtered by date range; month-only items whose range only partly overlaps are labelled, not silently counted.

### 6.7 Search

- Postgres full-text search (`tsvector`, generated columns, GIN indexes) on entries and their extensions, manuscripts, submissions (journal names), courses and tasks; `pg_trgm` indexes for partial-word matches ("starch", "SWAY").
- One SQL function `app.search(q, filters, cursor)` returns ranked results across types, with RLS applying inside it (`security invoker`).
- Cursor pagination on `(sort_date, id)` so multi-year histories page reliably.
- File contents are not searched in the beta.

### 6.8 Files

- Private bucket `evidence`; object path `<owner_id>/<attachment_id>/<filename>`; storage policies check the first folder equals `auth.uid()`.
- Upload: the server creates the `attachments` row (`pending`) and a signed upload URL → the browser uploads directly → the server verifies size, type (by content, not extension) and computes SHA-256 → `verified`.
- Download: `/api/files/[id]` checks access, then redirects to a 60-second signed URL.
- Proposed limits (to confirm): 20 MB per file; PDF, images, Word, Excel, CSV; 1 GB total to start.

### 6.9 Export, trash and backups

- **Export** (`/api/export`): streams a ZIP with `manifest.json` (schema version, counts, checksums, export time), `data.json` (all records, relationships, date precisions, full histories), `csv/` (one readable file per table, with cells starting `= + - @` escaped so spreadsheets don't run them) and `files/` (attachments). If it outgrows Vercel's function time limit, switch to a background job that writes the ZIP to storage and shows a download link.
- **Trash**: `deleted_at`; a nightly `pg_cron` job permanently removes rows and files older than 30 days. Before permanent deletion the UI offers an export.
- **Backups**:
  - Supabase Pro daily database backups.
  - Nightly GitHub Action: `pg_dump` + copy of the storage bucket → encrypted → Backblaze B2 / Cloudflare R2; keep 30 days.
  - `scripts/restore-drill.sh` restores the latest copy into a scratch project and runs row counts and checksum checks. Run it before release, then monthly. Target: at most 24 hours lost, restored within a working day (a target, not a guarantee). Named owner: you.

### 6.10 Environments, security and operations

| | Local | Staging | Production |
|---|---|---|---|
| Supabase | CLI in Docker | own project, synthetic data | Mumbai, Pro plan |
| App | `next dev` | Vercel preview deployments | Vercel production |
| Email | Supabase Inbucket | Resend test domain | Resend/SES, own domain |

- Security headers: strict Content-Security-Policy, `frame-ancestors 'none'`, HSTS. Authenticated responses are `private, no-store`.
- Supabase's built-in OTP rate limits stay on, plus a resend cooldown in the UI.
- Error reporting (e.g. Sentry) with request bodies and research text scrubbed; no product analytics on content.
- Secrets in Vercel/GitHub environment settings only.

### 6.11 Later: MCP for ChatGPT / Codex

- `/api/mcp` (Streamable HTTP, MCP TypeScript SDK). Sign-in via OAuth 2.1 using Supabase Auth's OAuth server (confirm its availability in a short test first).
- Tools call the same domain services inside `withUser()`, so RLS and every rule above apply:
  - read: `search_records`, `get_record`, `needs_attention`, `period_review`, `credit_summary`;
  - write: `create_entry`, `create_task`, `record_feedback`, `update_task_status`, `record_submission`, `add_attachment`.
- Read-only vs read-write scope chosen at connection time; write tools marked so ChatGPT asks for confirmation; no delete tool; everything stamped `created_via = 'chatgpt' | 'codex'`. Revocable in Settings.
- Uploads: Codex via signed upload URL; ChatGPT file handling to be tested before promising it.
- This reverses the plan's "no external AI in beta" — record it as an amendment.

### 6.12 Later: sharing with the guide

- Settings → Share a project or manuscript → guide's email + role. The invite email links to sign-in; the guide signs in with a code and sees "Shared with me" only.
- Changes needed: `shares` and `comments` tables, the extra clause in `app.can_read`, a read-only/comment layout, and second-account tests for every shared screen.

---

## 7. Testing

| Layer | Tool | What it proves |
|---|---|---|
| Unit | Vitest | Partial dates and period overlap, credit maths, phase/backfill logic, cycle detection, CSV escaping |
| Database | Vitest against local Supabase (or pgTAP) | RLS with **two users** on every table and function; composite FKs; revisions can't be edited; version conflicts; trash purge |
| End-to-end | Playwright (desktop + phone viewport) + axe | The usability tests from the plan: title-and-date entry in under 60 s; find a record within 3 actions; explain required vs recognised credits; save a failed experiment and see the earlier procedure; Journal A rejection then Journal B; January 2027 with no day; follow up an enquiry; export |
| Recovery | `restore-drill.sh` | Database **and** files come back and match checksums |

CI (GitHub Actions) on every pull request: type check, lint, unit, DB tests, Playwright against a preview deployment with seeded synthetic data. Production deploys only from `main`.

## 8. Build order (12–16 engineering weeks)

| Weeks | Stage | Done when |
|---|---|---|
| 1–2 | **Foundation**: repo, CI, Supabase local/staging/prod, email codes + SMTP + invite-only, profiles, base schema conventions, RLS function, `withUser`, partial-date library, backup job, first deploy | A second test account can see nothing of the first; backup lands off-site |
| 3–5 | **Daily value**: app shell (sidebar + phone bar), Quick Add, entries, Journal timeline/search/filters/Needs a date, Entry page with autosave and conflicts, projects, first JSON/CSV export | She can record, find, edit and export real entries |
| 6–8 | **Academic control**: tasks + waiting, Planner list/calendar/goals, requirements, courses, recognition, milestones, enquiries, Home | Home and Academics show correct, honest totals |
| 9–11 | **Research depth**: experiments + revisions + blockers, manuscripts + phase events + submissions + rounds, feedback → tasks, events/achievements, attachments | Failure, edits and resubmission keep all earlier evidence |
| 12–13 | **Private beta**: export with files, trash purge, restore drill, accessibility pass, phone pass, two weeks of real use, fixes | Restore drill passes; no critical defects |
| Later | MCP (≈1–2 weeks), sharing with guide (≈2–3 weeks), reports | Separately estimated |

Real research data goes in only after weeks 1–2 are done (auth, RLS, backups).

## 9. Decisions still needed from you

1. **University rules** on storing unpublished research in a managed cloud (Mumbai region) — confirm before real data goes in.
2. **Sign-in email**: does her university mailbox receive one-time codes promptly? If not, add a personal email or passkeys.
3. **File limits**: 20 MB per file and 1 GB total — OK?
4. **Budget**: about US$25–30/month (Supabase Pro + domain; Vercel Hobby and Resend free tiers to start).
5. **Who maintains it**: owner of backups, restore drills and updates (proposed: you).
6. **MCP timing**: after the beta (recommended) or sooner.

## 10. How this maps to the PRD gaps found earlier

| Gap | Resolution in this plan |
|---|---|
| Generic entry status (JRN-03, incl. Postponed) | `entries.status` |
| Project milestones (RES-03) | `milestones.project_id` |
| Skills acquired (EVT-04) | `entries.skills_learned` |
| Regulations & documents (ACD-05) | `regulations` + attachments |
| Decision records | entry `kind = 'decision'` (context/alternatives/rationale in description) |
| Competition outcome ("Idea submitted") | `events.submission_outcome` |
| Award without certificate | `events.award`; evidence optional |
| Task status renames (Doing/Waiting) | Kept; record as a PRD amendment |
