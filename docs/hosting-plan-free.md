# Hosting PhD Companion for free — Vercel Hobby + Supabase Free

**Goal:** put the app online at no cost while she tries it for a few weeks, without risking her data.
**Upgrade trigger:** once she relies on it, move Supabase to Pro (US$25/month) for daily backups and no pausing — nothing else changes.

## What "free" gives us — and what it doesn't

| | Supabase Free | Vercel Hobby |
|---|---|---|
| Cost | US$0 | US$0 (personal, non-commercial use) |
| Database | 500 MB — years of entries | — |
| File storage | 1 GB — roughly 50–200 evidence files | — |
| Region | Mumbai (ap-south-1) | Mumbai (`bom1`) for the app's server code |
| **Backups** | **None** — we cover this ourselves (step 7) | — |
| **Pausing** | Pauses after **7 days with no activity**; one click in the dashboard restores it | — |
| Sign-in emails | Built-in email reaches **only your Supabase team members** and is heavily rate-limited | — |

The two gaps that matter — no backups and the email limit — are handled in steps 4 and 7.

## Who does what

- **You:** create accounts, sign in to CLIs (I never see passwords), choose the email option, click "Deploy".
- **Me:** code and config changes, database setup through the CLI once you're signed in, environment values, the live check, backup script.

## Steps

### 0. Get the code ready (me, ~30 min) — ✅ done
- Commit and push the current work.
- `vercel.json`: run the server code in **Mumbai (`bom1`)**, next to the database. *This matters:* Home makes ~10 small database calls; from a US region each one adds ~0.2 s.
- Security headers in `next.config.ts`: HTTPS only, no embedding in other sites, no MIME sniffing, strict referrer, a content security policy.
- Auth settings and the sign-in email template set up so `supabase config push` can send them to the hosted project (sign-up off, 6-digit code, 10-minute expiry).
- A tiny `/api/health` check for the live test.
- Every page renders per request so each one carries a fresh security nonce; database connections use TLS when not local; `.env.example` lists the settings.

### 1. Create the Supabase project (you, ~5 min) — ✅ done: `ezdkpiepuzgsbtjqmpyi`, Mumbai (ap-south-1), Free
1. supabase.com → sign up with GitHub as `vijaybhaarath143`.
2. New project → **Free**, region **South Asia (Mumbai)**, name `phd-companion`.
3. Save the **database password** in your password manager.
4. In a terminal in this folder: `npx supabase login` (opens the browser).
5. Tell me the project's **reference ID** (Settings → General).

### 2. Set up the database (me, ~10 min) — ✅ done (schema, 19/19 tables with access rules, private storage, nightly Trash job)
- `npx supabase link --project-ref <ref>` (asks you for the database password once)
- `npx supabase db push` — creates every table, access rule, history rule, the private file bucket and the nightly Trash job.
- `npx supabase config push` — sign-in settings and email template (sign-up off, 6-digit code, 10-minute expiry).
  *Note:* the hosted project's Site URL and allowed return addresses live in `[remotes.production]` at the end of `supabase/config.toml`, so re-running `config push` keeps the live address (local dev still uses localhost).
- **No seed data** — the test accounts and examples stay local.
- Quick check with two temporary accounts that neither can see the other's data, then delete them.

### 3. Choose how sign-in reaches her — ✅ decided: **sign-in link** (option B below)

The free tier won't accept a custom email template with the built-in email service, so the default email (a sign-in link) is used. The app runs in `SIGN_IN_MODE=link` (the default): the link returns to `/auth/confirm`, works once, for 10 minutes, and only in the same browser that asked for it. Switching to 6-digit codes later = connect custom SMTP (option A), restore the template block in `supabase/config.toml`, set `SIGN_IN_MODE=code` on Vercel.

| Option | Cost | Notes |
|---|---|---|
| **A. Own domain + Resend** *(recommended)* | ~US$10–15 a year for the domain; Resend free (3,000 emails/month) | Reliable delivery to any mailbox, including her university one. Resend needs a domain to send to others. ~20 min DNS setup. |
| B. Built-in Supabase email | US$0 | Works only if she's added to your Supabase team, and it's rate-limited (a few emails an hour). Fine for a trial — sessions stay signed in for weeks, so she rarely needs a code. |
| C. "Sign in with Google" | US$0 | No emails at all. Needs a free Google Cloud setup (~15 min) and a small app change. Best if her university email is Google-based. |

My suggestion: **start with B** for the trial (zero cost, zero setup), move to **A** before relying on it.

### 4. Create her account (you or me, ~2 min)
Sign-up is off, so: Supabase → Authentication → Users → **Invite user** with her email (and add her to the Supabase team if using option B).

### 5. Deploy on Vercel (you click, I supply values, ~15 min) — ✅ done: live at https://phd-companion-lac.vercel.app (project `phd-companion`, team `ph-d-companion`), server code in Mumbai, the three variables saved for Production, only `master` builds
*Note:* Vercel Hobby only builds commits whose author email belongs to the Vercel account, so this repo commits as the `vijaybhaarath143` GitHub no-reply address (set in the repo's own git config). Merging a pull request on GitHub stamps the merge commit with the GitHub account's main email instead — if Vercel says the deployment was blocked, either add that email to the Vercel account (Account Settings → Authentication / Emails) or push any follow-up commit from this repo.
1. vercel.com → sign up with GitHub (`vijaybhaarath143`) → **Add New Project** → import `vijaybhaarath143/phd-companion`.
2. Environment variables (I'll give you the exact values from the Supabase dashboard):

| Name | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Settings → API keys |
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** (port 6543) |
| `SUPABASE_SECRET_KEY` | Supabase → Settings → API keys → secret key. Only for the Admin page (see `docs/rollout-admin.md`). |

   - The pooler is required: Vercel can't reach the direct database address (IPv6-only on Free), and the pooler handles many short connections. The app is already set up for it.
   - The **secret key** is only for the Admin page (adding, pausing and deleting accounts). It's read in `src/server/admin.ts` only, after the database confirms the person is an admin; a test fails the build if anything else reads it. Never give it a `NEXT_PUBLIC_` name.
3. **Turn off preview deployments** for other branches (Settings → Git), so test branches never touch her real database.
4. Deploy. You get an address like `phd-companion.vercel.app` (a custom domain can be added later).
5. Supabase → Authentication → URL configuration → set **Site URL** to that address, and add `https://<that address>/**` under **Redirect URLs** (sign-in links can only return to listed addresses). ✅ done via `config push`: only `https://phd-companion-lac.vercel.app/**` is allowed.

### 6. Live check before she uses it (me + you, ~15 min) — 🔄 started: `/api/health` reports the database connected; security headers present; signed-out visitors go to sign-in; sign-in page loads without errors
*Tip:* if `/api/health` says `db: false`, Vercel → Logs shows the database's reason (e.g. `28P01` = wrong password in `DATABASE_URL`; changes to variables only apply after a new deployment).
- Sign in with a code; record an entry; upload a file; open it; export.
- A second temporary account sees nothing of hers; signed-out visitors are sent to sign-in.
- Check pages load quickly from India.
- Then hand over: she signs in on her phone and laptop, and adds it to her phone's home screen.

### 7. Protect her data on the free tier — 🔧 built (Nov 2026 audit), the weekly Mac job still needs setting up
Free has no backups, so:
- **Her habit:** Settings → *Download export* (records + files in one ZIP, streamed so it works with any amount of files). Home shows a gentle reminder when the last export is more than 7 days old.
- **Your safety net:** `npm run backup` (`scripts/backup.mjs`) copies the whole database (accounts included) and all files from Supabase to your Mac, encrypted with `BACKUP_PASSPHRASE`, keeping the last 8. Set up `.env.backup` once (instructions at the top of the script), then run it weekly — e.g. a Calendar reminder or a `launchd` job. Needs Docker Desktop running.
- **Pausing:** daily use keeps it awake. If it ever pauses, Supabase → *Restore project* — nothing is lost.
- **Health:** `/api/health` also says whether the nightly Trash job last succeeded (`trashJob`).

### 7a. Hardening on the live project (after the Nov 2026 audit) — ✅ steps 1, 2 and 4 done 14 Nov 2026; CAPTCHA (3) not set up
1. ✅ `npx supabase db push` — applies `20261116000001_hardening.sql` (no hard deletes, Trash purge fix, storage clean-up, submission history, export date). Push it **before** deploying the code that reads `submission_events` / `last_export_at`.
2. ✅ Turn the **Data API off**: Dashboard → Project Settings → Data API → disable (or `npx supabase config push`, which sends `[api] enabled = false`). The app doesn't use it.
3. Optional, recommended: **CAPTCHA on sign-in** — create a free Cloudflare Turnstile widget for the site's domain, put its secret in Supabase → Authentication → Attack Protection → CAPTCHA (Turnstile), and set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` on Vercel.
4. ✅ Checked: no DELETE grants for signed-in users; `purge-trash` scheduled nightly (first run 15 Nov 03:30 UTC — `/api/health` shows `trashJob`).

### 8. When to upgrade
Move Supabase to **Pro (US$25/month)** when any of these is true:
- she's using it every week and wouldn't want to lose a day of entries;
- files approach 1 GB or the database approaches 500 MB (Settings → Usage);
- you want point-in-time restores without relying on the weekly backup.

The upgrade is a plan change in the dashboard — no migration, no downtime, same address.

## Total
- **Time:** about 2 hours across both of us, mostly waiting on sign-ups.
- **Cost:** US$0 (or ~US$10–15/year with option A's domain).

## Still open (from the technical plan)
- Is cloud storage in Mumbai acceptable under her university's rules for unpublished research?
- Do sign-in emails arrive promptly at her university address? (Only matters for options A/B.)
