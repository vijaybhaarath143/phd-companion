# PhD Companion

A private place for a PhD scholar to record what happened, organise it into projects,
manuscripts, experiments, courses and tasks, and find it again later.

- Plan: [docs/technical-plan.md](docs/technical-plan.md)
- Stack: Next.js 16 (App Router) · Tailwind 4 · shadcn/ui · Supabase (Postgres, Auth, Storage) · postgres.js

## Run it locally

Needs Node 20+ and Docker Desktop running.

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

Sign-up is turned off: accounts are created by invite (see `scripts/seed.mjs`).

Database browser (Supabase Studio): http://127.0.0.1:54323

## How it's put together

```
src/app/(auth)        sign-in and code entry
src/app/welcome       onboarding (3 skippable steps)
src/app/(app)         the app: Home, Journal, Research, Planner, Academics, Settings
src/app/api/export    "Export everything" (ZIP: data.json + CSV per table + manifest)
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

## Checks

```bash
npm run typecheck
npm run lint
```
