# PhD Companion

A private place for a PhD scholar to record what happened, organise it into projects,
manuscripts, experiments, courses and tasks, and find it again later.

- Plan: [docs/technical-plan.md](docs/technical-plan.md)
- ChatGPT / Codex connector (MCP): [docs/mcp.md](docs/mcp.md)
- Stack: Next.js 16 (App Router) · Tailwind 4 · shadcn/ui · Supabase (Postgres, Auth, Storage) · postgres.js

## Run it locally

Needs Node 22.13+ (pdf.js and supabase-js require it) and Docker Desktop running.

```bash
npm install
npm run db:start      # starts local Supabase in Docker (first run downloads images)
npm run db:reset      # applies the schema and loads example data
npm run dev           # http://localhost:3000
```

Sign in with one of the test accounts. Codes arrive in the local test inbox at
http://127.0.0.1:54324 (Mailpit) — nothing is sent to real email.

| Account | What it shows |
|---|---|
| `scholar@phd.test` | The PRD's June–November 2026 examples |
| `new@phd.test` | An empty account: onboarding and the first-day Home |
| `other@phd.test` | A second person — used to check nothing leaks between accounts |
| `admin` (username) | Platform admin: **People & access**. Sign in on the *Username & password* tab; the local password is in `scripts/seed.mjs` |

Sign-up is turned off. Accounts are created by the platform admin (People & access) or, locally, by `scripts/seed.mjs`.
People sign in with an email link, or with a username and password the admin gives them
(see `docs/platform-admin-and-collaboration-plan.md`).

Database browser (Supabase Studio): http://127.0.0.1:54323

## How it's put together

```
src/app/(auth)        sign-in and code entry
src/app/welcome       onboarding (3 skippable steps)
src/app/(app)         the app: Home, Journal, Research, Planner, Academics, Settings
src/app/api/export    "Export everything" (ZIP: data.json + CSV per table + manifest)
src/app/mcp           connector for ChatGPT / Codex (see docs/mcp.md); src/server/mcp has its tools
src/server/*.ts       read queries, one file per area
src/server/actions/   writes (server actions) — validation, plain-language errors
src/server/db.ts      withUser(): every query runs as the signed-in user, so
                      Postgres row-level security applies to app code too
supabase/migrations   the schema, access rules and history triggers
```

Rules the database itself enforces (not just the UI):

- every row belongs to one person; records can't be linked across people
- month-only dates can't secretly carry a day
- experiment edits from a new editing session keep the earlier version (read-only)
- manuscript phase history is append-only; "Record an earlier change" never moves the current phase
- a task can't wait on itself, directly or through other tasks
- nothing is erased with a person's own token: no DELETE or TRUNCATE for signed-in users
  (Trash is a soft delete), experiment revisions are written only by the database, and a
  manuscript's current phase moves only through a recorded phase change
- every change of a submission's status or decision date is kept (`submission_events`)
- Trash is emptied nightly (03:30) for items deleted more than 30 days ago; files of purged
  records and failed uploads are queued and removed from storage in the background
- the Data API (PostgREST) is off — the app reaches the database only through its server

Evidence files go straight from the browser into the person's own private storage folder
through a one-time link. The server then checks the real file type (not just the name),
size (20 MB max) and records a SHA-256 fingerprint before showing it. Files open through
60-second links, never public URLs. "Remove" hides a file but keeps it, and the export
ZIP includes every stored file. Storage only lets a file be removed once it is no longer
evidence (a failed upload, or a record purged from Trash).

## Backups (the free plan has none)

- **In the app:** Settings → *Download export* (records + files, streamed as one ZIP). Home
  reminds her when the last export is more than a week old.
- **On your Mac, weekly:** `npm run backup` copies the whole live database (accounts
  included) and every stored file, packs them into one archive, encrypts it, and keeps the
  last 8. Set it up once in `.env.backup` — see the top of `scripts/backup.mjs`.
- **Deleting an account** (removes her stored files too): `scripts/delete-account.mjs`.

## Checks

```bash
npm run typecheck
npm run lint
npm test              # needs local Supabase running (npm run db:start)
```

GitHub Actions runs all of these plus `next build` on every pull request
(`.github/workflows/ci.yml`). The seed script and the tests refuse to run unless the
database and Supabase point at this computer. `/api/health` reports the database and
whether the nightly Trash job last succeeded; server errors are logged as one JSON line
each (`src/instrumentation.ts`).

`tests/unit` covers dates, credits, CSV safety and file-type checks. `tests/db` runs
against the local database as two real accounts and checks that one person's records
never reach another — every table, search, Home, files — plus the history rules above.
