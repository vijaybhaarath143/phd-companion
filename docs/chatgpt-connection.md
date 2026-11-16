# Native ChatGPT connection

**Parked:** No live access or deployment has been enabled. See [model alternatives, local access and the resume checklist](model-access-options.md) before resuming.

Implemented in Settings → **Ask Sprig · ChatGPT**. This connects an already signed-in
PhD Companion user to their own ChatGPT account. Supabase continues to own app sign-in
and research authorization. The existing inbound MCP connector is unchanged.

This implementation covers OAuth and subscription-access verification. The full chat
inbox, conversation storage, research tool execution, and approval workflow remain in
[the implementation plan](native-assistant-implementation-plan.md). The static
[flow prototype](prototypes/chat-flow.html) remains a design reference.

## Availability prerequisite

A website identity client alone does **not** enable ChatGPT plan usage. The public
open-source registration flow uses a loopback callback and `dynamic_agent_client`;
this Vercel application deliberately does not use that registration flow, borrow a
Codex/T3 client, or relay a local subscription session.

Obtain a client issued for **PhD Companion**, with exact hosted callbacks and explicit
ChatGPT plan-usage permission. OpenAI must confirm this client's authorization contract:

- Authorization Code + PKCE, OIDC nonce, `resource=https://api.openai.com/v1`.
- `openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`.
- The registered token endpoint method, `none` or `client_secret_basic`.
- An ID token, bearer access token, renewable refresh token, expiry, and granted scopes.
- Account-specific `GET /v1/models` and streamed `POST /v1/responses` using OAuth bearer
  credentials for eligible plan requests.

The documented plan scopes above come from the open-source inference contract. A
provisioned hosted client must be approved for that same contract before enabling
this adapter. If OpenAI provisions different scopes or endpoints, update and retest
the adapter against that contract; setting an environment flag does not create access.

See official documentation: [Quickstart](https://developers.openai.com/siwc/quickstart),
[website OAuth](https://developers.openai.com/siwc/website),
[plan authorization contract](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
[models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference),
[refresh and revocation](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions),
and [request a client](https://developers.openai.com/siwc/request-client-id).
Recheck these when registering and before release; the hosted integration is not
validated against a live provisioned client in this PR.

## Deploy on Vercel

1. Apply `supabase/migrations/20261120000001_chatgpt_connection.sql` using the repository's
   normal migration process. It only creates two tables in the unexposed `app` schema.
   It does not alter research records, storage, or inbound MCP permissions.
2. Register a stable production callback:
   `https://YOUR_APP_HOST/api/chatgpt/callback`. Register a separate, stable staging
   callback/client if needed. Arbitrary Vercel preview hosts are intentionally rejected.
3. Set server-only variables from `.env.example`:

   | Variable | Value |
   | --- | --- |
   | `CHATGPT_CLIENT_ID` | This app's issued `oaiapp_…` client |
   | `CHATGPT_REDIRECT_URI` | Exact registered callback, including scheme and path |
   | `CHATGPT_TOKEN_AUTH_METHOD` | Provisioned `none` or `client_secret_basic` |
   | `CHATGPT_CLIENT_SECRET` | Required only for a confidential client |
   | `CHATGPT_TOKEN_ENCRYPTION_KEY` | Stable 32-byte random key, encoded as 64 hex characters |
   | `CHATGPT_HOSTED_PLAN_ACCESS` | `enabled`, only after the access prerequisite above |

   Generate the encryption key privately with a password manager or a cryptographic
   secret generator. Do not paste it into chat, source control, or diagnostics. Keep
   the same key across instances and deployments. Replacing it makes old envelopes
   unreadable and requires reconnecting; this initial implementation has no key ring.
4. Deploy. Without complete configuration the Settings page shows **Setup required**
   and no sign-in button. Do not enable the flag to work around a registration denial.
5. Sign into PhD Companion with the intended scholar account. Continue with ChatGPT,
   consent on OpenAI's website, and return to Settings. The account is shown as connected,
   with **subscription access still untested**.
6. Click **Check subscription access**. This retrieves available models and sends only
   `Reply with exactly: OK`. It uses a small amount of the account's ChatGPT allowance.
   A success notice appears only after `response.completed`. No research data is sent.
7. Check decline, expired app sign-in, reconnect, disconnect, and upstream plan limits
   in staging. Confirm the deployed route's duration supports the bounded 25-second
   probe. The route declares `maxDuration=60`; actual platform plan/config must allow it.

No OpenAI API key, platform billing fallback, browser session cookie extraction, or
background local relay is used. The person granting access connects their own account;
this is not a way to pool or transfer another person's subscription allowance.

## Endpoints

All mutations require a verified Supabase **browser** session and an exact matching
Origin. Responses are private/no-store. The proxy returns JSON 401 for signed-out
mutations rather than redirecting a fetch to HTML.

| Endpoint | Behavior |
| --- | --- |
| `POST /api/chatgpt/start` | Creates a fresh browser-bound transaction; returns an authorization URL and sets an HttpOnly/SameSite=Lax cookie (Secure on HTTPS) |
| `GET /api/chatgpt/callback` | Rechecks app identity, atomically consumes state, exchanges the code and validates the ID token; redirects to a clean Settings URL and clears the cookie |
| `POST /api/chatgpt/check` | Explicit, bounded subscription proof; returns only `{ checked: true }` after completed inference |
| `POST /api/chatgpt/disconnect` | Immediately clears local credentials and pending attempts; then attempts remote renewable-session revocation |

The callback never creates a PhD Companion account or app session. If the existing
app sign-in expires, no authorization code is redeemed. Start a fresh connection after
signing back in. Callback errors use a fixed set of UI messages; provider descriptions
and credential-bearing responses are not sent to the browser.

Each user has one active connection. Reconnect must validate the same OpenAI subject.
To change ChatGPT accounts, disconnect first, then connect another account. Failed or
declined reauthorization preserves the previous valid connection. A newer attempt
replaces an older pending attempt.

## Credential and concurrency model

- `app.chatgpt_connections` stores account metadata, version, encrypted credentials,
  refresh/check leases, and last successful access-check time.
- `app.chatgpt_transactions` stores one encrypted PKCE/nonce payload per user, hashed
  state/browser binding, version, and ten-minute expiry. Expired rows are unusable and
  overwritten on the next attempt; they are also removed on disconnect/account deletion.
- AES-256-GCM uses a fresh IV and binds ciphertext to owner ID and purpose. Tokens and
  verifiers remain server-side. The tables stay outside PostgREST's exposed schemas
  and outside research exports. No service-role key is used.
- Every database operation uses the existing `withUser` RLS boundary. The policies
  additionally deny tokens containing a connector `client_id`, even for the same user.
- A conditional DELETE consumes the pending transaction once across Vercel instances.
  Its connection version prevents an in-flight exchange from overwriting a disconnect
  or newer authorization. A discarded new token set is submitted for revocation.
- A short database lease serializes rotating refresh tokens. No transaction stays open
  during a network request. Explicit transient provider errors preserve credentials;
  rejected grants or ambiguous network outcomes require reconnect. A crashed lease
  never causes the potentially rotated refresh token to be reused.
- Access probes have a separate lease and a thirty-second per-user throttle across tabs.
  Their successful result must match the current connection version. Disconnect clears
  both leases and prevents a late probe from marking a disconnected account as checked.
- Disconnect clears local tokens even when upstream revocation cannot be confirmed.
  The UI then directs the user to remove the app in ChatGPT settings. Already-started
  upstream requests may finish; disconnect blocks future credential access.
- Account deletion cascades both tables. Credentials are never included in CSV/JSON
  exports. Keep token/code-bearing URLs, request bodies and authorization headers out
  of observability capture. Error handlers expose fixed codes instead of provider bodies.

Turning `CHATGPT_HOSTED_PLAN_ACCESS` off disables new authorization and inference.
Keep the other registration/key variables available so existing users can still
remove their connection. The Settings UI retains Disconnect while the feature is off.
If configuration/key material is lost, restore it before cleanup/reconnect; do not
silently substitute another client or another account's credentials.

## Integration with the remaining chat implementation

`usableCredentials(user)` is a **server-only** helper for the future native model
adapter. It returns credentials solely inside server code; never expose it as a Server
Action or API payload. The future chat runner must continue to recheck the app identity,
use the signed-in account's catalog, send `store:false`/`stream:true`, consume terminal
stream events, and enforce the run/approval/idempotency rules in the full plan.

A successful access check records that one request succeeded at that time. It does not
promise unlimited usage, permanent entitlement, or that all future models are available.
The current implementation does not run research tools or write proposals.

## Validation

```sh
npm run typecheck
npm run lint
npx vitest run tests/unit
npm run test:chatgpt:db
npm run build
```

The isolated database command requires Docker. It launches a fresh localhost-only
Postgres 17 container, installs minimal Supabase identity primitives and the real new
migration, then exercises the real `withUser` and connection service. It does not read,
reset or seed the application's database. The container and volume are removed afterward.
These integration tests mock OpenAI responses; they do not claim live OAuth validation.
The complete existing Supabase database suite remains a separate local-stack check.
