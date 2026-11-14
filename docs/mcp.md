# Using PhD Companion from ChatGPT and Codex

PhD Companion has a **connector**: a private door that lets ChatGPT (and Codex, OpenAI's
coding assistant) read her records and add to them, after she signs in and says "Allow".
It uses the Model Context Protocol (MCP), the standard ChatGPT and Codex use for apps.

- Connector address: **https://phd-companion-lac.vercel.app/mcp**
- She signs in with her usual emailed link, then approves the app on a PhD Companion page.
- The assistant sees **only her records** — the database's row-level security applies to every
  request, exactly as in the app.
- It can **read, add and update**, but it can **never erase** anything. "Remove" moves a journal
  entry or task to the app's Trash (restorable for 30 days).
- Everything it adds or changes is labelled in the app: "Added via ChatGPT", "via Codex".
- She can disconnect it any time: **Settings → Connected apps → Disconnect**. It stops working at once.

---

## 1. What we found (research, 14 Nov 2026)

**ChatGPT custom connectors.** ChatGPT connects to remote MCP servers over **Streamable HTTP**
(SSE also supported) from its developer mode, where custom MCP servers are added as "apps"
(older screens say "connectors"). Authentication is **OAuth** or none — ChatGPT cannot send a
static API key. The OAuth requirements: protected-resource metadata (RFC 9728) at
`/.well-known/oauth-protected-resource` or in the `WWW-Authenticate` header of a 401;
authorization-server metadata (RFC 8414 / OpenID discovery) that includes
`code_challenge_methods_supported: ["S256"]`; PKCE with S256; and either dynamic client
registration (DCR) or a client-ID metadata document. ChatGPT adds `resource=<server URL>` to
its authorization and token requests. Tools marked `readOnlyHint: true` are treated as reads;
other tools are write actions, which ChatGPT asks her to confirm (she can approve a tool for
the rest of a conversation). Developer mode is on ChatGPT **web**. Plan availability has
changed during 2026 and OpenAI's help article (12584461) couldn't be fetched to confirm it:
third-party guides list Plus, Pro, Business, Enterprise and Edu, with Free excluded, and say
full write actions came first to Business / Enterprise / Edu. **Check what her plan shows** —
if "Developer mode" isn't there, use Codex (below), which works on any plan that includes Codex.
Sources: [OpenAI — Add custom MCP server](https://developers.openai.com/api/docs/guides/developer-mode),
[OpenAI Apps SDK — Authentication](https://developers.openai.com/apps-sdk/build/auth),
[OpenAI help — Developer mode](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta).

**Codex.** Codex (CLI, IDE extension and app share `~/.codex/config.toml`) supports Streamable
HTTP MCP servers with `url = "…"`, and either **OAuth** (`codex mcp login <name>`, which uses
DCR when the server offers it and a loopback `http://127.0.0.1:<port>/callback`) or a bearer
token from an environment variable (`bearer_token_env_var`).
Source: [Codex — Model Context Protocol](https://developers.openai.com/codex/mcp).

**Supabase Auth's OAuth 2.1 server** turns a Supabase project into an OAuth provider: it is in
**beta, available on all plans including Free, at no extra cost** (connected apps count toward
monthly active users like any sign-in — one for her). It offers DCR, PKCE (S256), refresh
tokens and discovery at `https://<ref>.supabase.co/.well-known/oauth-authorization-server/auth/v1`.
The consent screen is a page in our app (`site_url` + `authorization_url_path`), built with
`supabase.auth.oauth.getAuthorizationDetails / approveAuthorization / denyAuthorization`.
Access tokens are ordinary Supabase tokens for her account (`sub`, `role: authenticated`,
`aud: authenticated`) plus `client_id` (which app) and `session_id`, so row-level security
works unchanged. Local support needs Supabase CLI ≥ 2.54.11 — this repo uses 3.1.0, which has
`[auth.oauth_server]` in `config.toml` (local Auth v2.197.0). Verified locally end-to-end.
Sources: [Supabase — OAuth 2.1 server](https://supabase.com/docs/guides/auth/oauth-server),
[Getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
[MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication),
[Token security](https://supabase.com/docs/guides/auth/oauth-server/token-security).

**Decision: use Supabase's OAuth 2.1 server**, as preferred. She signs in exactly as she does
today, approves on our own consent page, and both ChatGPT and Codex work without her copying
any keys. The alternative — personal access tokens made in Settings, stored hashed, revocable —
was not needed. It would have been simpler to build but worse for her: ChatGPT can't use a
static token at all, and a long-lived token pasted into Codex's config is a password that
never expires unless remembered and revoked. (If Supabase's beta ever goes away, that is the
fallback: Codex would keep working with `bearer_token_env_var`; ChatGPT would need OAuth from
another provider.)

## 2. How it works

```
ChatGPT / Codex ──► https://…/mcp           (no token → 401 + where to sign in)
                ──► /.well-known/oauth-protected-resource/mcp
                      → "sign in at https://ezdkpiepuzgsbtjqmpyi.supabase.co/auth/v1"
                ──► Supabase Auth: register app (DCR) → authorize (PKCE)
                      → our page /oauth/consent  (sign in with emailed link if needed → Allow)
                      → code back to ChatGPT / Codex → access + refresh token
                ──► /mcp with "Authorization: Bearer <token>"   (every request)
```

On **every** request to `/mcp` (`src/app/mcp/route.ts`):

1. The bearer token is verified (`src/server/mcp/auth.ts`): signature against the project's
   published keys (JWKS; ES256/RS256), issuer = this project, audience `authenticated`, not
   expired, a real user (not anonymous / service), and it **must carry a `client_id`** — so a
   normal browser sign-in token can't be used here. (If the hosted project still signs with the
   legacy shared secret, the token is checked by asking Supabase Auth instead.)
2. The database confirms the sign-in session still exists for that app
   (`app.connector_session_ok()`), so **Disconnect** takes effect immediately rather than when
   the hour-long token expires.
3. A fresh MCP server is created for this request only (stateless — fits Vercel serverless) and
   every tool runs through `withUser(...)`: Postgres row-level security applies, as in the app.
   File reads/writes go to her private storage folder **using her token**, so storage's own
   access rules apply too.

Labels: `withUser` passes the token's `client_id` to Postgres; `app.request_source()` turns the
registered app name into `chatgpt`, `codex` or `mcp` (anything else), and that is the default for
`created_via` (entries, tasks, projects, manuscripts, phase history, submissions, files) and is
written to `changed_via` on every update (entries, tasks, manuscripts, feedback). In the app it
shows as "Added via ChatGPT" (entry page), "added/updated via ChatGPT" (planner), "via ChatGPT"
(files and links, manuscript phase history).

Files (in `src/`): `app/mcp/route.ts` (endpoint) · `app/.well-known/oauth-protected-resource/…`
(metadata) · `app/(auth)/oauth/consent/page.tsx` (consent screen) · `server/mcp/` (auth, tools,
input schemas, file-text extraction, HTTP helpers) · `server/writes.ts` (write rules shared
with the app's own server actions) · `server/actions/connections.ts` (Allow / Don't allow /
Disconnect) · migration `supabase/migrations/20261115000001_mcp_connector.sql`.
`src/proxy.ts` skips `/mcp` and `/.well-known/…` (they use bearer tokens and return JSON, so
the page CSP and sign-in redirect don't apply); every page keeps its strict CSP. If she opens
the consent page signed out, the proxy remembers it in a 15-minute cookie and the sign-in link
brings her back to it (only that page can be remembered).

## 3. What the assistant can do (tools)

Read-only (marked `readOnlyHint`, so ChatGPT doesn't ask before using them):

| Tool | What it does |
|---|---|
| `search` | Search everything: journal entries (incl. experiments, feedback, enquiries), projects, manuscripts, journal submissions, tasks, courses, files and links |
| `get_home_summary` | The Home page: needs attention, coming up, working on, recent entries, credits |
| `get_timeline` | The Timeline page: everything in date order, newest first (entries, experiments, tasks, manuscript phases and submissions, feedback, courses, milestones, enquiries, goals, projects, files), filtered by kind, project, or this month / this year; partial dates kept, undated things listed separately, upcoming ones marked |
| `list_journal_entries` | Journal entries, newest first, filtered by words / category / project / months; partial dates shown as "14 Nov 2026", "January 2027 · day not known" or "No date yet" |
| `get_journal_entry` | One entry in full: notes, people, outcome, event / feedback / enquiry details, tasks from it, files |
| `list_projects`, `get_project` | Projects; one project's manuscripts, experiments, open tasks, entries, milestones, files |
| `list_manuscripts`, `get_manuscript` | Manuscripts with phase; one manuscript's full phase history, submissions and decisions, guide feedback, waiting tasks |
| `list_experiments`, `get_experiment` | Experiments; one experiment's record, blockers, files and its earlier versions |
| `list_tasks` | Open (default), waiting (with reasons) or done tasks |
| `list_goals` | Goals and outcomes |
| `get_academics` | Credits (required / earned / incomplete), courses, milestones, office enquiries |
| `list_files_and_links` | Files and links on an entry, project, manuscript, course or milestone |
| `read_file_text` | The text inside a file: PDF text, Word, Excel/CSV rows, PowerPoint slide text, text files. 40,000 characters per call (`start` reads on); PDFs up to 300 pages, spreadsheets up to 2,000 rows per sheet. Images have no text. |

Adding and changing (ChatGPT asks her to confirm):

| Tool | What it does |
|---|---|
| `create_journal_entry` | New entry with a partial date (`2026-11-14`, `2026-11`, or none — never a guessed day), category, project, notes, people |
| `create_task` | New task, optional due date, project, manuscript, or the entry it came from |
| `update_task_status` | To do / doing / waiting (needs what it's waiting for) / done / cancelled |
| `add_link` | Attach a web link to an entry, project, manuscript, course or milestone |
| `add_guide_feedback` | Record feedback on a manuscript; optionally one task per requested change |
| `move_manuscript_to_phase` | Move a manuscript to a phase (history kept); `history_only` records an earlier change without moving it |
| `add_file` | Attach a file sent as base64 — same rules as the app: allowed types, 20 MB, real-type check (`sniff()`), SHA-256. In practice keep under ~3 MB: Vercel limits a request to 4.5 MB and base64 adds a third |
| `move_to_trash` | Move a journal entry or task to Trash (restorable for 30 days). Nothing is ever permanently deleted through the connector |

## 4. Turning it on for the live site (needs your OK — not done yet)

These change the hosted project, so they were **not** done from the development branch.
Do them in this order, after reviewing the branch `claude/mcp-f9701a`:

1. **Database migration.** Apply `supabase/migrations/20261115000001_mcp_connector.sql` to the
   hosted database (adds the source labels and the two checking functions; no data changes):
   ```bash
   npx supabase link --project-ref ezdkpiepuzgsbtjqmpyi
   npx supabase db push
   ```
2. **Switch on the OAuth server** (Supabase Auth). Either push the config — the
   `[remotes.production.auth.oauth_server]` block at the end of `supabase/config.toml`
   (`enabled = true`, `authorization_url_path = "/oauth/consent"`, `allow_dynamic_registration = true`):
   ```bash
   npx supabase config push --project-ref ezdkpiepuzgsbtjqmpyi
   ```
   or in the dashboard: **Authentication → OAuth Server** → enable, Authorization path
   `/oauth/consent`, turn on **Allow Dynamic OAuth Apps**. Check **Authentication → URL
   Configuration → Site URL** is `https://phd-companion-lac.vercel.app` (the consent page
   address is built from it).
3. **Signing keys (check only).** Dashboard → **Project Settings → JWT Keys**. If the current
   key is an ECC (P-256) or RSA key, nothing to do. If it still says "Legacy JWT secret", the
   connector still works (it asks Supabase Auth to check each token, a little slower); Supabase
   recommends moving to asymmetric keys for the OAuth server — that is a separate, careful
   change (rotate, wait, then revoke the old key).
4. **Deploy.** Merge the branch into `master`; Vercel builds it. **No new Vercel environment
   variables** are needed (it uses `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   and `DATABASE_URL`, already set).
5. **Check** (any browser):
   - https://phd-companion-lac.vercel.app/.well-known/oauth-protected-resource/mcp shows
     `"authorization_servers": ["https://ezdkpiepuzgsbtjqmpyi.supabase.co/auth/v1"]`
   - https://ezdkpiepuzgsbtjqmpyi.supabase.co/.well-known/oauth-authorization-server/auth/v1
     includes a `registration_endpoint`
   - https://phd-companion-lac.vercel.app/mcp answers **401** with a `WWW-Authenticate` header
   - Then connect ChatGPT or Codex as below, ask "What needs my attention?", and check
     **Settings → Connected apps** lists it.

## 5. Connecting ChatGPT (for her — about 3 minutes, on a computer)

1. Open **chatgpt.com** in the browser she uses for PhD Companion (sign-in links only work in
   the browser that asked for them).
2. Turn on developer mode: **Settings → Apps** (may be called *Apps & Connectors*) **→ Advanced
   settings → Developer mode** → on. (OpenAI moves these menus from time to time; the words to
   look for are *Developer mode* and *custom MCP server*.) (On a work/university plan an admin may need to allow it.)
3. Add the app: in **Settings → Apps** choose **Create** / **Add custom MCP server** (on some
   accounts this is at chatgpt.com/plugins → **+**). Fill in:
   - Name: `PhD Companion`
   - Server URL: `https://phd-companion-lac.vercel.app/mcp`
   - Authentication: **OAuth** (leave client ID / secret empty)
   - Tick "I understand and want to continue", then **Create**.
4. ChatGPT opens a PhD Companion page. If asked, sign in with her email and open the emailed
   link **in the same browser**. She lands on "Connect ChatGPT to PhD Companion?" → **Allow**.
5. In a new chat, pick PhD Companion from the **+** menu (Developer mode / apps), then ask, e.g.
   *"What needs my attention this week?"*, *"Summarise my guide's feedback on the SLR 1
   manuscript"*, *"Add a journal entry: met my guide on 12 November about chapter 3"*.
   When it wants to add or change something, ChatGPT shows what it will do — she clicks
   **Confirm**.

## 6. Connecting Codex (CLI, IDE extension or the Codex app)

```bash
codex mcp add phd-companion --url https://phd-companion-lac.vercel.app/mcp
```

```bash
codex mcp login phd-companion
```

The login opens the browser: sign in if asked, then **Allow**. Check with `codex mcp list`
(or `/mcp` inside Codex). The same entry can be written by hand in `~/.codex/config.toml`:

```toml
[mcp_servers.phd-companion]
url = "https://phd-companion-lac.vercel.app/mcp"
```

There is no long-lived token to paste: access tokens last an hour and Codex refreshes them.
To stop it, **Settings → Connected apps → Disconnect**.

## 7. Developing and testing locally

`supabase/config.toml` enables the OAuth server locally (`[auth.oauth_server]`), so after
pulling this branch restart Supabase once: `npx supabase stop && npm run db:start`, then
`npm run db:reset`. Local discovery is at
`http://127.0.0.1:54321/auth/v1/.well-known/oauth-authorization-server` (the RFC 8414
path-inserted form only exists on the hosted project). The consent page is built from
`site_url` (`http://localhost:3000`); if the app runs on another port, open the same
`/oauth/consent?authorization_id=…` address on that port.

- MCP Inspector: `npx @modelcontextprotocol/inspector`, transport *Streamable HTTP*, URL
  `http://localhost:3000/mcp`, and its OAuth settings to sign in. (The end-to-end check below
  was done with plain HTTP requests and the browser for the consent step.)
- Tests: `tests/unit/mcp-auth.test.ts` (token checks, return-to safety),
  `tests/unit/mcp-schemas.test.ts` (tool inputs), `tests/unit/extract.test.ts` (file text),
  `tests/db/mcp.test.ts` (every tool as user A vs user B: B can't read, change, attach to or trash
  A's records; labels; Trash only; Disconnect stops the token).

Verified end-to-end locally on 14 Nov 2026: dynamic registration → authorize with PKCE and
`resource` → signed-out redirect to sign-in → emailed link → back to consent → Allow → code →
token (ES256, `client_id`, refresh token) → all 23 tools of the first version over HTTP, including uploading and
reading PDF / Word / Excel / PowerPoint / CSV files (dev server and production build) →
"via ChatGPT" / "via Codex" labels in the app → refresh token → Disconnect in Settings →
next call 401 and refresh refused.

`get_timeline` (added after the Timeline tab was merged) reuses `src/server/timeline.ts` and is
covered by `tests/db/mcp.test.ts`, which calls it through a real MCP client.
