# PhD Companion — production-readiness audit (first cut)

**Date:** 14 Nov 2026 · **Code:** `master` @ `1ef0364` · **Scope:** every feature built so far: sign-in, Home, Timeline, Journal, Research, Planner, Academics, Settings, onboarding, Quick add, Guide me, file preview, files and export, the Trash job, and the ChatGPT / Codex connector.

> ## Fix status — 14 Nov 2026 (branch `claude/phd-companion-audit-dfce9c`, not yet merged)
>
> **Every finding below is fixed in code**, except the two plan features ruled out of scope: `regulations` and `goal_tasks`.
>
> **Checks:**
> - typecheck, lint and `next build` pass;
> - **160 tests pass**, including the new `tests/db/hardening.test.ts`, `tests/db/features.test.ts` and the connector, extraction and consent tests;
> - checked by hand in the browser: sign-in, export, uploads, the experiment editor (status change, then offline and Retry), and Home at phone width.
>
> **New migration:** `supabase/migrations/20261116000001_hardening.sql`. It covers:
> - **No deletes or rewrites through the database:**
>   - DELETE, TRUNCATE, TRIGGER and REFERENCES are revoked from signed-in users;
>   - experiment revisions are written by the database only;
>   - a manuscript's phase changes only through a recorded phase change.
> - **Trash purge:** it can no longer get stuck on waiting tasks, and it now also purges courses and goals.
> - **Storage:**
>   - files that are no longer evidence are queued for removal;
>   - verified files can't be deleted from storage;
>   - a connector's storage access ends at Disconnect.
> - **Records are linked within one owner only.**
> - **Her own date:** `app.user_today()` gives today in her time zone.
> - **New data:** `submission_events` (submission history), `profiles.last_export_at`, `goals.deleted_at`.
> - **Connector labels:** these are now based on the app's redirect address, not the name it gives itself.
>
> **What is now in the repo:**
> - a streamed export;
> - `npm run backup` (encrypted, keeps 8 copies);
> - `scripts/delete-account.mjs`;
> - CI (`.github/workflows/ci.yml`);
> - structured error logs;
> - the Trash job's status in `/api/health`;
> - optional Turnstile CAPTCHA on sign-in.
>
> **Still to do on the live project (see [hosting-plan-free.md §7a](hosting-plan-free.md)):**
> 1. Push the migration.
> 2. Turn off the Data API.
> 3. Optionally set up CAPTCHA.
> 4. Set up the weekly backup on your Mac.

**Previous reviews:** none. Neither merged PR (#1 Timeline, #2 Connector) had a review, so this is the first one.

## How it was done

- **Checks run:**
  - `tsc`, ESLint and all 106 tests (unit, plus database tests against local Supabase) pass.
  - `next build` passes.
  - `npm audit --omit=dev`: 6 low/moderate advisories, all inside the `shadcn` CLI's own dependencies. Nothing reaches the running app.
- **Code reviewed:** every source file, split into five areas: auth and connector sign-in, database and access rules, server writes / files / export, connector tools, and screens.
- **Findings reproduced:**
  - Database findings were run as real SQL against the local database, inside transactions that were rolled back.
  - Connector extraction limits were measured with crafted files.
  - The top findings were re-checked by reading the code.
- **Not checked against the live site:** nothing was run against production. Settings that depend on the hosted project are marked **[check live]**.

## Verdict

The foundations are strong:
- every query runs as the signed-in user, with row-level security on all 19 tables;
- cross-user links are blocked by the database;
- the CSP is strict and uses nonces;
- file type is checked from the actual bytes, and files are fingerprinted with SHA-256;
- the connector checks its tokens carefully;
- partial dates and credit sums are handled carefully.

**It is not ready for her to rely on yet.**
- There is **no working recovery path for her data**. Supabase Free keeps no backups, the export can't cope with real file volumes, and the backup script was never written.
- Several ways of losing or corrupting data are open: hard deletes through the Data API, a Trash job that can stop for good, and an autosave that can hang.

Six items should be fixed before she depends on it. Most are small.

---

## Fix before she relies on it

### 1. Her account's token can hard-delete or rewrite everything, outside the app — High
- **Where:** `supabase/config.toml` `[api] schemas = ["public"]`; `owner_delete` / `owner_update` policies in [core.sql:516-519](../supabase/migrations/20261114000001_core.sql); storage `evidence_delete` ([core.sql:549-552](../supabase/migrations/20261114000001_core.sql)).
- **The problem:** the app never uses the Supabase Data API (PostgREST); all access goes through `withUser`. But the API is still exposed, and `authenticated` holds DELETE and UPDATE on every table. Anyone holding a token for her account can call `/rest/v1/*` and `/storage/v1/*` directly.
- **Who could hold such a token:**
  - a connected ChatGPT / Codex app, for up to one hour after **Disconnect**, since only `/mcp` checks `connector_session_ok()`;
  - a phished connector (see 7);
  - a script that gets into the page (the session cookies can be read by JavaScript).
- **What such a token can do** (each reproduced locally):
  - permanently delete entries, tasks or manuscripts, skipping Trash; a manuscript delete also wipes its "append-only" phase history;
  - set `current_phase` without writing a phase event;
  - insert forged experiment revisions;
  - mark attachments as `verified`;
  - delete or replace stored evidence files.
- **The same root cause covers:**
  - `authenticated` also has **TRUNCATE**, which ignores row-level security. It can only be reached from SQL, not through the API.
  - `requireUser`, `/api/export` and `/api/files` accept connector tokens.
- **Fix:**
  1. Stop exposing `public` through the Data API: in the Dashboard (API settings) and in `config.toml`. Storage is unaffected. **[check live]**
  2. `revoke delete, truncate, trigger, references on all tables in schema public from authenticated`, and the same in default privileges.
  3. Make `keep_experiment_revision` and `apply_phase_change` `security definer`. Then revoke INSERT on `experiment_revisions` and UPDATE of `current_phase`.
  4. Drop the storage delete policy, and refuse tokens that carry `client_id` everywhere except `/mcp`.

### 2. No recovery path for her data — High
- **No backups:** Supabase Free has none. Step 7 of [hosting-plan-free.md](hosting-plan-free.md) (`scripts/backup.sh`, weekly export reminder) was never built.
- **Export breaks with real file volumes:** [api/export/route.ts:30-62](../src/app/api/export/route.ts) loads every table and every file into memory and builds the ZIP in one `zipSync` call (about 2× the data in memory). The technical plan says it streams; it doesn't.
  - Near the 1 GB storage cap, it exceeds the 2 GB function memory.
  - Vercel refuses buffered function responses over 4.5 MB. So the export likely fails after only a few PDFs.
  - Plausible, not tested on Vercel: whether a `Response(Buffer)` counts as buffered there.
- **Fix:**
  - Stream the ZIP: fflate `Zip` + `ZipPassThrough` into a `ReadableStream`, storing files without re-compressing them.
  - Build the backup script and the reminder.
  - Or move Supabase to Pro before she relies on it.

### 3. The nightly Trash purge can stop for good, for everyone — High
- **Where:** [files_and_trash.sql:18](../supabase/migrations/20261114000002_files_and_trash.sql) and the FK at [core.sql:428](../supabase/migrations/20261114000001_core.sql).
- **The problem:** she trashes task A while task B is "waiting on" A. Thirty days later `delete from tasks` fails on `tasks_waiting_on_task_id_owner_id_fkey`, and the whole purge rolls back. It fails again every night after that. The only trace is in `cron.job_run_details`. Reproduced.
- **Fix:** before the delete, run `update tasks set waiting_on_task_id = null where waiting_on_task_id in (…purged…)`. Alternatively make the FK `on delete set null (waiting_on_task_id)`, or clear the link in `trashTask`. Add a test for it.

### 4. Autosave hangs for good after a network error — High
- **Where:** [autosave.tsx:31-37](../src/components/app/autosave.tsx).
- **The problem:** `await save(...)` has no try/catch. If the request itself fails (signal drops in the lab, an expired session, or a new deploy), then:
  - the change being sent is discarded;
  - `inFlight` stays `true`, so every later edit is queued and never sent;
  - the status stays on "Saving…" forever, and Retry / Copy text never appear;
  - reloading loses everything typed since.
- **Affects:** the Journal entry editor and the experiment editor.
- **Fix:** wrap the call in `try/catch/finally`. Always clear `inFlight`, put the patch back in the queue, and show "failed".

### 5. Changing an experiment's status breaks the next save — High
- **Where:** [research.ts:177](../src/server/actions/research.ts), [experiment-editor.tsx:67,137](../src/app/(app)/research/experiments/[id]/experiment-editor.tsx).
- **The problem:** `setExperimentStatus` bumps `version`, but the autosave keeps the old one. So the moment she clicks "Unsuccessful" and starts writing the interpretation, she gets "Changed in another tab — reload". Reloading loses what she typed.
- **Fix:** return the new version and call `auto.setVersion`, or send the status through the autosave patch.

### 6. A failed action replaces the page and loses typed text — Medium-High
- **The problem:**
  - There is no `error.tsx`, `global-error.tsx`, `not-found.tsx` or `loading.tsx` anywhere.
  - A thrown error inside a transition is not caught in [action-form.tsx:36](../src/components/app/action-form.tsx), [quick-add.tsx:118](../src/components/app/quick-add.tsx) or [welcome/page.tsx](../src/app/welcome/page.tsx). A network error or a deploy mid-session then replaces the page with the framework error screen, and her Quick add text or "Record feedback" notes are lost.
  - Onboarding calls `required()` outside `run()`, so a blank or too-long name crashes the page.
- **Fix:** catch errors in these handlers and show the existing inline error with Copy text. Add `src/app/(app)/error.tsx`, `global-error.tsx` and `not-found.tsx`.

---

## Medium

| # | Area | Finding | Fix |
|---|---|---|---|
| 7 | Connector sign-in | Dynamic client registration lets anyone register an app called "ChatGPT" with their own redirect. The consent page shows that name in large type, and the real destination only in small grey text. One click on Allow gives them tokens, which combine with item 1. The "via ChatGPT" label also trusts the name the client chose for itself. [consent/page.tsx:38-82](../src/app/(auth)/oauth/consent/page.tsx) | Allow only known redirect hosts (`chatgpt.com`, plus loopback for Codex), or show a prominent warning for any other host. Label the source by `client_id`, not by name. |
| 8 | Connector files | `read_file_text` has no limit on decompressed size or time. Measured: a 726 KB .docx reached 2.47 GB of memory; a 295 KB .pptx produced 294 M characters; a real 8.9 MB .xlsx used about 1 GB; a 61 KB PDF would take about 130 s, against a 60 s limit. The assistant calls this tool without asking her. [extract.ts](../src/server/mcp/extract.ts) | Check the total uncompressed size and the number of zip entries before inflating. Extract only up to `start + 40k` characters. Give the PDF reader a time budget. |
| 9 | Connector transport | GET `/mcp` returns a stream that closes at once. Standard MCP SDK clients then reconnect about once a second for as long as they stay connected; each reconnect costs a token check and a database query against the Hobby invocation quota. [mcp/route.ts:32-43](../src/app/mcp/route.ts) | Return `405` with `Allow: POST` for GET and DELETE. |
| 10 | Storage | Files are left in storage with no record pointing to them, so they use the 1 GB quota and never appear in exports. Three causes: the purge deletes `attachments` rows but not the files; abandoned or pending uploads are never cleaned up; deleting her account leaves `storage/<uid>/` behind. | Have the purge queue the storage paths it removes, and add a server sweep (Storage API) for those and for pending/failed uploads older than 1 day. |
| 11 | Uploads | Valid .txt/.csv files are rejected as "not the type its name says". The UTF-8 check cuts at byte 4090, which can split a multi-byte character (Devanagari text, for example). Windows-1252 CSVs (Excel on Windows, with characters like "°C" or "µL") are also rejected. [files.ts:66-69](../src/lib/files.ts) | Decode with `{stream:true}` or trim to a character boundary. Keep only the "no NUL bytes" check. |
| 12 | Dates | Some dates use the database clock (UTC) instead of her time zone, so anything recorded between 00:00 and 05:30 IST lands on the previous day. Affected: `current_date` in [academics.ts:39,82](../src/server/actions/academics.ts), [research.ts:196](../src/server/actions/research.ts), and the `blockers.opened_on` default. | Pass in `todayIn(profile.timezone)`. |
| 13 | Dates | Hydration mismatches, and times shown in UTC: `toLocaleString` runs in client components that are also rendered on the server. This happens on every experiment that has revisions. [experiment-editor.tsx:178](../src/app/(app)/research/experiments/[id]/experiment-editor.tsx), [manuscript-view.tsx:280](../src/app/(app)/research/manuscripts/[id]/manuscript-view.tsx), [settings-client.tsx:78,100](../src/app/(app)/settings/settings-client.tsx) | Format on the server using the profile's time zone. |
| 14 | Manuscripts | Updating a submission with an empty decision date erases the earlier one. Revision rounds (`submission_rounds`) from the plan aren't built, so each status change overwrites the previous one with no history. [research.ts:95](../src/server/actions/research.ts) | Use `coalesce` for the date, and add rounds as history rows. |
| 15 | Journal | Changing an entry's date while an autosave is in flight sends the old version, causing a false conflict. [entry-editor.tsx:114](../src/app/(app)/journal/[id]/entry-editor.tsx) | Make `flush()` wait for the in-flight save. |
| 16 | Journal | Changing the category later never changes `kind`. An entry added without a category and later set to "Conference" never shows the event fields. | Recompute `kind` and create the `events` row when the category changes. |
| 17 | Home | With no journal entries, Home shows the first-day layout, which hides overdue tasks and the requirements (`isEmpty = recent.length === 0`). [home.ts:145](../src/server/home.ts) | Decide "empty" from all record types. |
| 18 | Research | Experiments can't be renamed, moved to another project, archived or trashed. | Add those controls to the experiment page. |
| 19 | Academics | A milestone's "Update" resets its done date to today, because no default value is passed. Targets can't be edited, and month-only dates stop at this year + 2. [academics-client.tsx:167](../src/app/(app)/academics/academics-client.tsx), [partial-date-input.tsx:44](../src/components/app/partial-date-input.tsx) | Pass the existing value, and widen the year range. |
| 20 | Quick add | Esc, an outside click or a swipe-down on the phone throws away the draft without asking. | Ask before closing when there is text, or keep the draft. |
| 21 | Onboarding | The buttons have no pending state, so a double tap on "Finish" can create two projects. | Use `useFormStatus` and disable the button while saving. |
| 22 | Concurrency | Most edits (task, project, course, milestone) bump `version` but never check it, so the last save wins. `updateEntry` also doesn't protect feedback or enquiry fields edited from another screen. | Check `version` the same way the entry and experiment saves already do. |
| 23 | Sign-in | An unknown address gets an "invite-only" message, so anyone can test which addresses have accounts. Nothing stops someone requesting sign-in links for her address all day, which uses up the project's small hourly email quota. [actions/auth.ts:30-66](../src/server/actions/auth.ts) | Always show "check your email". Turn on Supabase CAPTCHA (Turnstile is free). |

## Low

**Security hardening**
- Session cookies can be read by JavaScript. Set `httpOnly: true` and `secure: true` in `cookieOptions`.
- Sign out uses the global scope by default, which signs out her other devices and probably disconnects ChatGPT too. Use `{scope:"local"}`.
- A brief Supabase Auth outage returns 401 from `/mcp`, so the assistant treats its token as revoked and asks her to reconnect. Return 503 instead.
- A .pptx preview turns embedded SVGs into blob URLs on the app's own origin. Opening one in a new tab runs its scripts. Skip SVG in [file-preview.tsx:458](../src/components/app/file-preview.tsx).
- Some links aren't restricted to the same owner: `corrects_event_id`, `replaced_by_id` and `attachments.parent_id` (no FK at all). Another account could then block her deletes. Sign-up is off, so the risk is low.
- The task-cycle check can be beaten by two simultaneous edits. Fix with an advisory lock in the trigger.
- `scripts/seed.mjs` and `tests/db` have no guard against a production `DATABASE_URL`. Make them refuse any host other than localhost.

**Connector**
- File text reaches the assistant without being marked as untrusted. Wrap it, and say so in the tool description.
- Corrupt or password-protected files return "Couldn't save… try again". They should return "This file couldn't be read".
- `update_task_status` and `move_manuscript_to_phase` overwrite fields but claim `destructiveHint:false`.
- `add_file` advertises 20 MB, but Vercel accepts at most 4.5 MB request bodies. Say "about 3 MB" and add `.max()` to the input.
- A retried write creates a duplicate entry or task, because each call gets a new UUID.
- Some list tools say more items exist but give no way to fetch them; `get_timeline` stops at 300 items.
- `read_file_text` and `search` still return files attached to records in Trash.

**App**
- These ignore `{ok:false}`, so the UI shows success while nothing saved:
  - the task checkboxes (entry editor, project page, planner);
  - `resolveBlocker`, `reopenFeedback`, `setGoalOutcome`.
- `upload()` in `evidence.tsx` has no catch.
- Bad URL parameters cause a 500: `?project=abc`, `?from=2026-13`, `month=2026-13`. The `[0-9a-f-]{36}` id check also accepts 36 dashes.
- `finishUpload` keeps a database transaction open while it downloads up to 20 MB, with a pool of only 5 connections.
- The Journal month filter uses `type="month"`, which desktop Safari and Firefox don't support, so typed values are ignored.
- "Copy text" in the entry editor leaves out most fields.
- Search: `ilike` doesn't escape `%` and `_`. The OR'd search can't use its indexes, and foreign-key columns have no indexes. Fine at her data volume.
- Not built yet from the plan:
  - a web app manifest and icons (the plan says "installable");
  - `regulations` and `goal_tasks`;
  - editing or deleting goals and courses;
  - "open the last project";
  - cursor paging (lists grow up to 5000 rows; Done tasks stop at 300, Trash at 50).
- The CSV export adds a leading `'` to negative numbers.
- The Guide me overlay has no focus trap.

**Operations**
- No CI. The technical plan calls for type check, lint and tests on every PR; `.github/` doesn't exist.
- No error reporting. Production errors appear only in Vercel logs (2 `console.error` calls in the code), and pg_cron failures only in `cron.job_run_details`.
- On a fresh clone, `npm run typecheck` fails with 15 errors until `next typegen` (or `next dev`) has run. Change the script to `next typegen && tsc --noEmit`.
- **[check live]** Confirm in the Supabase Dashboard:
  - Data API exposed schemas (item 1);
  - sign-up is off;
  - both migrations are applied;
  - the `purge-trash` cron job has succeeded (`cron.job_run_details`).

---

## Per-feature verdict

| Feature | Verdict | Blocking items |
|---|---|---|
| Sign-in & sessions | Needs fixes | 1, 23 |
| Home | Needs fixes | 6, 17 |
| Timeline | Ready | (performance with a large history is the only thing to watch) |
| Journal | **Not ready** | 4, 15, 16 |
| Research (projects, manuscripts, experiments) | **Not ready** | 5, 14, 18 |
| Planner | Needs fixes (minor) | checkbox failures are silent |
| Academics | Needs fixes | 12, 19 |
| Settings, export, Trash | **Not ready** | 2, 3, 10 |
| Onboarding | Needs fixes | 6, 21 |
| Quick add | Needs fixes | 6, 20 |
| Guide me | Ready | (minor focus trap) |
| File upload & preview | Needs fixes | 11, 10 |
| ChatGPT / Codex connector | Needs fixes | 1, 7, 8, 9 |

## Checked and found sound

- **Row-level security:** on for all 19 tables, with WITH CHECK on every update policy, so `owner_id` can't be changed. `anon` has no table access.
- **Cross-user links:** composite `(id, owner_id)` foreign keys stop projects, entries, manuscripts, courses and tasks being linked across accounts.
- **Database access in code:**
  - every app and connector query goes through `withUser`, which is transaction-scoped and correct under the Supavisor transaction pooler;
  - there is no service-role key in `src`;
  - all SQL is parameterised;
  - search uses `websearch_to_tsquery`.
- **SECURITY DEFINER functions:** fixed `search_path`, and `purge_trash` is executable only by `postgres`.
- **Storage:** private bucket, folder must equal `auth.uid()`, no overwrite policy, 20 MB limit. Files are opened through signed links lasting 60–120 s.
- **Uploads:** type check, size check and SHA-256 all run on the bytes actually downloaded from storage. Finishing an upload twice is harmless.
- **Proxy and pages:**
  - the matcher can't be bypassed (`/mcpx`, `/MCP`, `/.well-knownx`, `/sign-in-foo` all tested);
  - the return-to allowlist is anchored;
  - server actions are protected by the Origin check and SameSite cookies;
  - framing is blocked;
  - the CSP uses a nonce with `strict-dynamic`.
- **Connector tokens:** limited to asymmetric algorithms, with issuer, audience, expiry, role, `client_id` and `session_id` all checked. Browser tokens are refused at `/mcp`.
- **Connector writes:** they use the same `writes.ts` rules as the app, there are no hard deletes, and `move_to_trash` is a soft delete.
- **Links and previews:** user links must be http(s), so `javascript:` URLs are blocked. Word previews are sanitised, and pdf.js is past the FontMatrix CVE.
- **Dates and credits:** partial dates never invent a day. Credits never treat unknown as 0 and never add completed and recognised together. Home, the Planner and the Timeline compute "today" in the profile's time zone.
- **CSV export:** formula injection is escaped.

## Suggested order

1. **Today (config only, about 30 min):** stop exposing `public` through the Data API; revoke DELETE and TRUNCATE; check the live settings marked **[check live]**.
2. **Data safety PR:** the purge fix (3), autosave (4), experiment version (5), error boundaries and caught errors (6), and the UTC dates (12).
3. **Backups PR:** a streamed export (2), the backup script and the export reminder, and a storage clean-up sweep (10). Or upgrade to Supabase Pro.
4. **Connector hardening PR:** redirect allowlist (7), extraction limits (8), 405 on GET (9), and the Low connector items.
5. **Feature gaps and the Medium UI items (13–22)**, then CI.
