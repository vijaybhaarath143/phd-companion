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

Sign-up is turned off: accounts are created by invite (see `scripts/seed.mjs`).

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

## Sprig, the mascot

Sprig is the app's sprout with a face. It's in the bottom-right corner of every signed-in
page and of Admin (`SprigDock`), and in the page itself on sign-in, the code screen,
onboarding, the first-day Home, some empty states, "Step done" and the not-found and error
pages (`LiveSprig`). Every Sprig plays when clicked or tapped. Only the one in the corner is a
keyboard stop and speaks to screen readers (its menu and lines); the ones in pages are decoration,
so they never stand between her and a form.

```
src/components/app/sprig.tsx        the drawing: moods × growth stages (server-safe SVG)
src/components/app/sprig-live.tsx   alive: breathing, blinking, eyes that follow, tap reactions
src/components/app/sprig-dock.tsx   the companion in the corner: bubble, menu, idle life, dozing
src/components/app/sprig-lines.ts   everything Sprig says
src/components/app/sprig-bus.ts     how the rest of the app calls it
src/app/globals.css (end)           the animations
```

**The logo** is Sprig as a tile: the app's rounded square with a face, leaves growing out of the
top. `brand.tsx` is the logo with the stacked "PhD / Companion" name (sidebar, sign-in, Admin,
onboarding); it blinks, watches the pointer, wiggles its leaves on hover and hops when clicked.
The drawing lives once, in `sprig-mark-art.mjs`, and the app icons are made from it: after
changing it, run `npm run icons` to rewrite the favicon, the Apple icon and the install icons
(a unit test checks their sizes and the manifest).

How it hears about things:

- **Toasts:** every `toast.success` gets a nod and every `toast.error` a worried face, on
  their own (it watches Sonner). Nothing to add at call sites.
- **Real milestones:** call `celebrate(title, detail)` (`components/app/celebrate.tsx`), or
  pass `celebrate` to `ActionForm`. Sprig flips and throws confetti; where there's no Sprig
  in the corner (or a dialog is covering it) a celebration toast shows instead.
- **A task ticked off:** `cueSprig({ kind: "done" })`.

Rules it keeps: it never nags or guilt-trips (unit tests check the lines); it greets each
area once per visit and makes its "I wasn't sleeping" joke once per visit; a passing line never
blocks a tap on the page under it; "Tuck me away" leaves only its leaves and eyes peeking out,
remembered on that device; on a phone it ducks the same way while she types; it stops its idle
movement while dozing or tucked; under reduced motion it keeps its faces and words but doesn't
move; it isn't printed.

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
