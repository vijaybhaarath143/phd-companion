# Platform admin, password sign-in and project collaboration — plan and design

Status: **Phase 1 (accounts) built and reviewed for production** — `supabase/migrations/20261119000001_accounts.sql`, `/admin`, password sign-in. Phases 2–4 are still proposals. Amends `docs/technical-plan.md` §6.12 ("Later: sharing with the guide") and §6.x auth ("no passwords").

> **Since this plan was written, master moved to "One PhD, no projects"** (`20261118000001_single_phd.sql`): the PhD is the one project and reviews became publications. Phases 2–4 below still say "project"; before building them, the unit people are invited to must be re-decided — most likely *her whole PhD* (guide sees everything she marks shareable) or *one publication* (guide reviews a manuscript). The membership/role/persona model, the `can_read(owner, scope)` approach and the denormalised scope column all carry over; only the scope column changes (`publication_id` instead of `project_id`).

## Switching Phase 1 on in production

1. Push the migration (`npx supabase db push`).
2. Set the password rule on the hosted project to match `supabase/config.toml`: Authentication → Policies → minimum length 10, letters and digits (or `npx supabase config push`).
3. Add `SUPABASE_SECRET_KEY` to the Vercel project's environment (server only, never `NEXT_PUBLIC_`). Without it, People & access is read-only.
4. Make yourself admin once: `node --env-file=<env with DATABASE_URL> scripts/grant-admin.mjs <your email>`.
5. Sign in → **People & access** → give Deepika's existing account a username (row menu → Set username), then **Reset password** to get her a temporary password. She can keep using the email link too.

What protects password sign-in in production:
- **Attempt limits (app-side).** Password sign-in calls Supabase from the server, so Supabase's own per-address limit only sees the server. The app counts failures itself (`app.sign_in_failures`, hashed keys, kept one day): 10 per account or 30 per network address in 15 minutes pauses that account/address for 15 minutes.
- **CAPTCHA.** If Turnstile is switched on, the sign-in page has one check for both tabs, refreshed after each attempt.
- **Same answer for every failure** (unknown username, wrong password, suspended).
- **Suspension is immediate** everywhere: app pages and actions, file storage, and ChatGPT/Codex (answered 401, so they stop retrying). Sessions are also removed; if the hosted project doesn't allow that, suspension still holds through the checks above.
- Optional, on Supabase Pro: Authentication → Policies → *Leaked password protection*.

## 1. What we are building

| # | Need | Who |
|---|---|---|
| 1 | A **platform admin** (you) who creates and manages every account. Sign-ups stay closed. | Admin |
| 2 | **Username + password** sign-in, next to the existing email link/code. | Everyone |
| 3 | Deepika (and later anyone else) gets an account from the admin and signs in with either method. | Admin → user |
| 4 | Inside a project **she owns**, she adds **collaborators** (can edit) and a **guide** (reviews: reads, comments, approves / asks for changes). | Project owner |
| 5 | Everything else she keeps (journal, planner, academics, notes outside a project) stays **private to her**. | — |

Two separate ideas, kept separate in the data model so it scales:

- **Platform role** — what you can do to *accounts* (`platform_admin` or nothing). Applies app-wide.
- **Project role** — what you can do *inside one project* (`owner`, `editor`, `reviewer`, `viewer`). Applies per project.

A **persona** ("Guide", "Co-supervisor", "Co-author", "Lab member") is a *label* on a project membership, not a permission. The guide is a `reviewer` labelled "Guide". New personas need no code or schema change.

**Privacy rule:** the platform admin manages accounts but **cannot read anyone's research data**. Being admin grants nothing inside projects; you'd need to be added to a project like anyone else.

## 2. Today (what the design builds on)

- Supabase Auth; sign-ups disabled; email link or 6-digit code (`src/server/actions/auth.ts`).
- Every table has `owner_id`; every RLS policy calls `app.can_read(owner_id)` / `app.can_write(owner_id)` (= `owner_id = auth.uid()`). The plan always intended sharing to extend these.
- Composite FKs `(x_id, owner_id)` make cross-user links impossible.
- App queries run through `withUser()` as role `authenticated`, so RLS applies to server code too.
- The service-role key is not in the Next.js runtime.

## 3. Data model

### 3.1 New tables

```
app.platform_roles            -- who is a platform admin (not writable by users)
  user_id      uuid PK → auth.users
  role         text  check (role in ('platform_admin'))
  granted_by   uuid → auth.users
  granted_at   timestamptz

public.profiles  (+ columns)
  username             citext unique      -- 3–32 chars, [a-z0-9._-], lower-case
  full_name            text
  account_status       text  'active' | 'suspended'
  must_change_password boolean default false
  created_by           uuid → auth.users  -- the admin who created the account

public.project_members
  project_id   uuid  → projects(id)  on delete cascade
  user_id      uuid  → auth.users
  role         text  'owner' | 'editor' | 'reviewer' | 'viewer'
  persona      text  null             -- "Guide", "Co-author", … free label (≤40 chars)
  status       text  'active' | 'removed'
  added_by     uuid  → auth.users
  added_at, removed_at timestamptz
  PK (project_id, user_id)
  index (user_id, project_id) where status = 'active'
  -- exactly one active 'owner' per project (partial unique index)

public.access_requests        -- owner asked to add someone who has no account yet
  id, project_id, requested_by, email_or_username, role, persona,
  status 'open' | 'done' | 'declined', handled_by, created_at, handled_at

public.comments               -- guide/collaborator discussion on any project item
  id, project_id, owner_id (= project owner), author_id,
  target_type ('project','entry','manuscript','task','note','review_step','experiment','milestone'),
  target_id, parent_id (thread), body (≤10k), resolved_at, resolved_by,
  created_at, edited_at, deleted_at

public.review_requests        -- "Guide, please review this"
  id, project_id, owner_id, target_type, target_id,
  requested_by, reviewer_id,
  status 'pending' | 'approved' | 'changes_requested' | 'withdrawn',
  request_note, decision_note, decided_at, created_at

app.audit_log                 -- append-only; admin actions + membership changes
  id, actor_id, action, subject_user_id, project_id, details jsonb, at
```

### 3.2 Changes to existing tables

1. **`project_id` on every project-scoped row.** Today some rows reach their project only through a parent (experiment → entry → project; submission → manuscript → project; attachments via `parent_type/parent_id`). Add a denormalised `project_id` to: `experiments`, `experiment_revisions`, `experiment_trials`, `feedback`, `enquiries`, `events`, `manuscript_phase_events`, `submissions`, `submission_events`, `attachments`. A trigger copies it from the parent on insert and when the parent's `project_id` changes. Result: **one uniform RLS rule** for every shared table, fast with an index, no multi-table joins inside policies.
2. **`created_by uuid default auth.uid()`** on project-scoped tables, so work by a collaborator is attributed ("Added by Arun").
3. **`owner_id` stays the project owner** for every row in her project, even when a collaborator writes it. The data belongs to the project owner; composite FKs keep working unchanged; deleting a collaborator's account never deletes her project data. A `before insert` trigger sets `owner_id` from the project when the writer isn't the owner.
4. Backfill: each existing project gets a `project_members` row `(owner_id, 'owner')`.

### 3.3 Access functions (the only place rules live)

```sql
app.is_platform_admin()            -- exists in app.platform_roles for auth.uid()
app.project_role(project uuid)     -- 'owner' | 'editor' | 'reviewer' | 'viewer' | null
                                   -- security definer, stable, reads project_members (active only)

app.can_read(owner uuid, project uuid default null)
  = owner = auth.uid()
    or (project is not null and app.project_role(project) is not null)

app.can_write(owner uuid, project uuid default null)
  = owner = auth.uid()
    or (project is not null and app.project_role(project) in ('owner','editor'))
```

Policies on project-scoped tables change from `app.can_read(owner_id)` to `app.can_read(owner_id, project_id)` — a mechanical migration over the same table list. Personal tables (courses, requirements, goals, profiles, unassigned entries/tasks/notes) keep the one-argument form, so **they can never be shared** — a row with `project_id is null` is private by construction.

What each project role may do:

| Action | owner | editor | reviewer (guide) | viewer |
|---|---|---|---|---|
| See project and its items | ✔ | ✔ | ✔ | ✔ |
| Add / edit items | ✔ | ✔ | — | — |
| Move to Trash / restore | ✔ | own items | — | — |
| Comment | ✔ | ✔ | ✔ | — |
| Approve / request changes on a review request | — | — | ✔ | — |
| Request a review | ✔ | ✔ | — | — |
| Add / remove members, change roles | ✔ | — | — | — |
| Archive / delete project | ✔ | — | — | — |
| Leave project | — | ✔ | ✔ | ✔ |

Files: storage paths stay `<owner_id>/…`. Shared users never touch storage directly — `/api/files/[id]` already reads the `attachments` row under RLS and returns a short signed URL, so the new `attachments` policy is what grants access.

MCP (ChatGPT/Codex) tokens: phase 1 keeps them owner-only (`app.can_read` ignores memberships when the request carries a `client_id`). Shared-project access for assistants can come later.

### 3.4 Why this scales

- Adding a role, persona or shared table is data or one policy line, not a redesign.
- One indexed lookup (`project_members (user_id, project_id)`) per policy check; Postgres caches the `stable` function per statement.
- Organisations/departments later = one more table (`organisations`, `organisation_members`) and an `organisation_id` on projects; the project-role layer stays the same.

## 4. Authentication

### 4.1 Username + password

- Supabase Auth requires an email on every user. Accounts created with **only a username** get a non-deliverable placeholder email (`<user-id>@users.invalid`, confirmed), so they can only use the password. Accounts with a real email can use **either** the password or the existing link/code.
- Sign-in form gets two tabs: **Email link** (today) and **Username & password**. The password tab accepts a username *or* an email.
- A username is resolved to the auth email **on the server only** (a privileged SQL function the app server calls outside `withUser`; never exposed to the browser), then `signInWithPassword`. Every failure — unknown user, wrong password, suspended — shows the same message: "Username or password is incorrect."
- The existing Turnstile CAPTCHA (when enabled) covers the password tab too; Supabase's own sign-in rate limit applies.
- Password rules: at least 10 characters, letters and digits (`minimum_password_length = 10`, `password_requirements = "letters_digits"` in `supabase/config.toml` and the hosted project).
- **First sign-in with an admin-set password → forced "Choose your own password" screen** (`must_change_password`). Settings gets "Change password".
- Forgot password: users with a real email get a reset link; username-only users ask the admin, who sets a new temporary password.
- Sign-ups remain disabled. Only the admin creates accounts.

### 4.2 How the admin creates accounts

Creating auth users needs Supabase's admin API (secret key). Recommended: a small `server-only` module `src/server/admin/` that

1. verifies `app.is_platform_admin()` **in the database** for the signed-in caller,
2. then uses `SUPABASE_SECRET_KEY` (server env only, never `NEXT_PUBLIC_`) to create / update / ban the auth user,
3. writes the profile + `app.audit_log` row.

Nothing else in the app imports that module (an ESLint rule enforces it). Alternative if you want the key fully out of the web app: the same logic as a Supabase Edge Function. Same behaviour, one more deploy target.

Suspending = Supabase ban + `account_status = 'suspended'` + sign out all sessions. Accounts are never hard-deleted from the UI; the existing `scripts/delete-account.mjs` stays the deliberate, offline way.

### 4.3 Bootstrapping you as admin

A one-off script `scripts/grant-admin.mjs <email>` (service key, run locally, like `delete-account.mjs`) inserts your row in `app.platform_roles`. There is no UI path to become the first admin.

## 5. Screens

### 5.1 Sign in
- Tabs: **Email link** · **Username & password**. Password tab: username-or-email, password, "Forgot password?".
- After first password sign-in: **Choose your password** (new + confirm), then Home.

### 5.2 Admin → People (`/admin`, visible in nav only to the platform admin)
- Table: name, username, email, status, last sign-in, projects owned, joined.
- **Add person** drawer: full name · username · email (optional) · "Create a temporary password" (generated, shown once with a copy button) or "Email them a sign-in link" · ☐ Make platform admin.
- Row menu: Reset password · Suspend / Reactivate · Make / remove admin. Every action asks to confirm and is audited.
- **Requests** tab: owners' "please create an account for X" requests → "Create account" pre-fills the drawer; after creation the person is added to the project automatically.
- **Activity** tab: the audit log.

### 5.3 Project → People (inside a project she owns)
- Panel on the project page: member avatars with role and persona chips ("Prof. Rao · Guide · Reviewer").
- **Add person**: type an exact username or email → role (Editor / Reviewer / Viewer) → persona (Guide, Co-supervisor, Co-author, Lab member, or custom).
  - Exact match found → added immediately.
  - No match → "There's no account for this person yet. Ask the admin to create one?" → creates an access request. (Owners can't browse the user list — no directory of who uses the app.)
- Change role, remove (with confirm). Removed people lose access at once; their past comments stay, attributed.

### 5.4 For collaborators and guides
- Nav gains **Shared with me** (projects where they're a member, grouped by owner). A guide-only account sees just this plus Settings — no empty journal/planner.
- Shared project pages reuse the existing project/manuscript/experiment screens; controls are hidden by role (reviewer/viewer see no edit buttons; the server and RLS refuse anyway).
- A banner says whose project it is and your role.
- **Comments** side panel on project items; owners and editors can resolve.
- **Review requests**: owner clicks "Request review" on a manuscript, step or experiment → picks a reviewer → guide sees it under "To review" → Approve / Request changes with a note → owner sees the decision on the item and on Home.

## 6. Build phases

| Phase | Scope | Done when |
|---|---|---|
| **1. Accounts** (first) | `platform_roles`, profile columns, audit log, grant-admin script, admin People screen, password tab, forced password change, change password in Settings, password policy | You sign in as admin, create Deepika's account with a username and temporary password, she signs in with it and with her email link, and sets her own password |
| **2. Membership + read sharing** | `project_members` (+ backfill), denormalised `project_id` + triggers, two-argument `can_read`, Project → People, access requests, Shared with me, read-only shared screens | A reviewer added to project A sees A and nothing else of hers; removing them cuts access immediately |
| **3. Guide review** | `comments`, `review_requests`, comment panel, To review list, decisions on Home | Guide comments and approves; owner sees it |
| **4. Collaborator editing** | two-argument `can_write`, `created_by` attribution, owner_id trigger, editor Trash rules, conflict handling with the existing `version` column | An editor adds an experiment trial; it shows "added by", belongs to her project, and survives the editor's removal |

Each phase ships with database tests in `tests/db/` using **three accounts** (owner, member, outsider) for every table and function touched, matching the existing privacy tests.

## 7. Risks and how they're handled

| Risk | Handling |
|---|---|
| A sharing bug leaks her private data | Personal tables keep owner-only policies; `project_id is null` ⇒ private; outsider-account tests on every table |
| Secret key misuse | Only in `src/server/admin/`, DB-verified admin check first, lint-enforced import boundary, audit log |
| Password guessing | 10+ chars, same error for every failure, CAPTCHA, Supabase rate limits |
| Admin overreach | Admin role grants no project access; all admin actions audited |
| Policy slowdown | Denormalised `project_id`, one indexed membership lookup per check |
