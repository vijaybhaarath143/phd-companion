# Model access options and parked work

Status: **Parked at the user's request on 16 November 2026.**

This records the options discussed after implementing the hosted ChatGPT connection.
No alternative provider has been selected or integrated. The PR should remain a draft;
resuming requires a choice of chat location, authentication method and inference budget.
Do not activate the hosted connection, deploy migrations, or switch billing automatically.

## What is already in this PR

- The [42-case prototype and 14-step journey](prototypes/README.md).
- The [full frontend/backend implementation plan](native-assistant-implementation-plan.md).
- A [native ChatGPT OAuth connection](chatgpt-connection.md): Settings controls, callback
  validation, encrypted credential storage, refresh, disconnect and an explicit access probe.
- Automated tests and a disposable Postgres 17 integration harness. OpenAI responses are
  mocked; these tests do not establish live subscription access.

The production chat inbox, durable conversations, tool runner and approved research writes
remain planned. The existing inbound MCP connector is separate from the native connection.
No live hosted subscription connection, production migration or deployment was performed
as part of this work. This document adds planning only, not model integrations.

## Requirements to preserve

PhD Companion is a personal, noncommercial research tool being built for the developer's
wife. It is hosted on Vercel so she can access it remotely. The developer prefers to avoid
API keys and use subscription access. The designed native chat inbox is desirable, but
moving conversation into a provider's own app is an alternative with a different experience.

Two decisions must be explicit when resuming:

1. Must the chat stay inside PhD Companion, or can it happen in ChatGPT/Claude?
2. Does "no API key" mean no developer API usage at all, or just no key setup for the wife?
   With a server-side API integration, the developer manages the key; she never handles it.
   That still uses an API key and separate provider billing/quotas.

## Options compared

| Option | Chat interface | Authentication/infrastructure | Current status |
| --- | --- | --- | --- |
| Hosted ChatGPT subscription | Native PhD Companion inbox | OpenAI-provisioned hosted client with plan access, then user consent | Connection adapter implemented; access unverified, inbox planned |
| Local personal ChatGPT app | Locally running PhD Companion | Eligible account, dynamic registration, loopback callback, protected local runtime | Requires a different registration implementation |
| ChatGPT + PhD Companion MCP | ChatGPT | User's ChatGPT account and an authorized app-tool connection; account/workspace feature availability applies | MCP code exists; deployed setup must be verified |
| Claude + PhD Companion MCP | Claude web/app | User's Claude account and a custom remote connector | Requires Claude-specific consent/authentication support and end-to-end verification |
| Gemini API | Native PhD Companion inbox | Server-side Gemini API key; selected models have limited free-tier access | Not implemented |
| Claude API | Native PhD Companion inbox | Claude Console API key or supported cloud provider; separate API billing | Not implemented |
| Self-hosted open model through Ollama | Native PhD Companion inbox | Always-available inference machine/server and a protected connection from the app | Not implemented; hardware/model suitability must be evaluated |

This is an options list, not a promise that every route is immediately available or that
all models support the same research tools, document inputs or response formats.

## Hosted ChatGPT subscription access

OpenAI distinguishes eligible local personal/open-source integrations from remotely hosted
apps. Its documented guidance directs paid or remotely hosted apps to request access.
Being a personal, noncommercial project does not establish a hosted-access exemption.
Identity-only sign-in does not grant inference permission.

The implemented adapter requires a hosted client approved for the contract described in
[the deployment guide](chatgpt-connection.md#availability-prerequisite). A flag or successful
mock test does not grant provider access. The user must authorize plan usage, and a live
request must complete successfully before treating the connection as verified.

Sources: [availability and usage policy](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt#usage-policy-and-terms),
[quickstart](https://developers.openai.com/siwc/quickstart).

### Applying as an individual

The access-request form asks for work email, company and website information. An individual
can describe the project honestly if the form accepts those inputs; acceptance and approval
are not guaranteed. No documented bypass for a rejected personal email was established.

Suggested fields, not a submitted application:

- Company: `Independent developer — personal project`.
- Website: the actual PhD Companion deployment URL; use the repository only if accepted.
- Email: the developer's own contact email, if accepted by the form.
- Capability: **Sign in and ChatGPT plan use for AI requests**.

Suggested description:

> I am an individual developer building PhD Companion, a personal, noncommercial research
> organizer for my wife. It runs on Vercel so she can access it anywhere. I am requesting
> permission for the signed-in user to connect their ChatGPT subscription for research chat
> and tools.

No company registration, employer affiliation or provider approval should be invented.
See [OpenAI's client request page](https://developers.openai.com/siwc/request-client-id).

## Local personal ChatGPT route

The documented local flow uses first-time dynamic registration, a stable host ID, fresh
PKCE/state/nonce, and a callback on `127.0.0.1`. The issued client ID is then saved for
that account/registration. This differs from the current hosted adapter; allowing a local
URL in development does not implement dynamic registration.

A local runtime must actually run on the relevant computer. Opening `localhost` on a phone
reaches that phone, not the developer's laptop. Completing a local OAuth callback and
forwarding credentials to the existing Vercel backend is not the local personal-app route.

OpenAI separately documents an open-source self-hosted VM procedure with local sign-in,
secure credential transfer and a VM-specific host ID. Do not infer from this that a
serverless hosted app or a multi-user subscription relay automatically qualifies. Confirm
the intended runtime, user/workspace and permitted deployment before choosing that route.

Sources: [registration/sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in),
[self-hosted VMs](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms).

## Use a provider's chat interface with the app's tools

With a remote MCP connector, the provider hosts the chat and invokes PhD Companion tools.
The app can remain on Vercel. Research ownership still comes from the scholar's Supabase
session and connector consent. This avoids embedding subscription inference in our app;
it does not deliver the custom native inbox.

### ChatGPT

The repo already contains an inbound ChatGPT/Codex MCP connector. Confirm the subscriber's
custom MCP/plugin access, OAuth configuration and deployed tools before use. Private
connection setup is separate from public marketplace publication and from SIWC hosted
plan-usage approval.

Source: [custom MCP servers in ChatGPT](https://developers.openai.com/api/docs/guides/developer-mode).

### Claude

Anthropic documents custom remote connectors on individual plans, including one connector
on Free as of this research. This is a possible way for the wife to work with her app data
from Claude without an Anthropic API key or OpenAI's SIWC application process.

**Repo gap:** `src/server/mcp/clients.ts` currently allows OpenAI-hosted callbacks and
loopback clients. It refuses Claude-hosted callbacks. This is not plug-and-play today.
When resuming, deliberately add the documented Claude client/callback identity, review
Supabase client registration compatibility, and update consent wording, provenance and
ownership/revocation tests. Never broadly allow arbitrary HTTPS redirects.

Verify read/write tool behavior and confirmations through the deployed connector. Do not
assume that the native proposal UI's atomic approvals are automatically reproduced by a
provider's chat interface.

Sources: [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp),
[connector surfaces](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors).

## Alternative inference inside the native inbox

### Gemini API

This can be implemented without OpenAI's hosted-subscription registration. It still
requires Gemini API authentication. Selected models have free-tier quotas; eligibility,
verification, models and limits must be checked for the actual account. This is not
unlimited free inference or a reuse of a consumer chat subscription.

The developer could store one key privately on Vercel, while the wife simply signs into
PhD Companion. Before sending unpublished research, choose the appropriate data-handling
tier: Google's documentation distinguishes free-tier and paid-service data treatment.

Sources: [API keys](https://ai.google.dev/gemini-api/docs/api-key),
[billing and data treatment](https://ai.google.dev/gemini-api/docs/billing).

### Claude API

A native Claude adapter would use the developer API or a supported cloud provider.
Anthropic's documented rules do not permit offering Claude.ai login in our own app or
routing users' requests through consumer-plan credentials. A Claude subscription is not
a general replacement for a Claude API key in this Vercel inbox. The documented ability
to host the unmodified Claude Code binary is a separate product/runtime arrangement,
not the native chat architecture currently implemented here.

Source: [authentication and credential use](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use).

### Self-hosted open models via Ollama

Local Ollama inference does not require a vendor API key. For remote access, the app
would call an inference server that stays running on suitable hardware. This adds compute,
networking and operational work beyond the current Next.js/Supabase deployment. Model
size, document handling, tool calling, response quality and latency need a small evaluation
against the four MVP research flows before committing to hardware or a hosting plan.

Keep the model endpoint behind app-controlled authentication. The fact that Ollama's local
API does not require authentication is not a reason to expose it publicly without protection.
Direct Ollama cloud requests require an API key; signed-in Ollama runtime/cloud arrangements
are a separate option to investigate, not an integration implemented or selected in this PR.

Sources: [Ollama authentication](https://docs.ollama.com/api/authentication),
[local/cloud choices](https://docs.ollama.com/cloud).

## Backend and frontend changes to consider after resuming

Preserve the shared research-tool and approval architecture in the full plan. Implement a
provider adapter only after selecting an access route and proving one real request.

- Backend: separate API-key, subscription-OAuth and self-hosted credentials; normalize model
  discovery, streaming, cancellation and errors; expose provider capabilities explicitly.
- Tools: validate arguments on the server, enforce ownership, keep approved writes atomic,
  and preserve idempotency/receipts regardless of model choice.
- Frontend: label the actual provider and connected account, distinguish connected from
  access-verified, and show provider-specific setup/usage/recovery messages.
- UX: do not display a provider picker until its choices work. Keep the 42-case prototype as
  the behavior reference, with capability differences explained where they affect decisions.
- Billing: no silent provider switch, paid fallback or API-key requirement hidden from the
  developer. The wife's sign-in should remain separate from infrastructure credentials.

## Resume checklist

1. Choose native inbox versus a provider's chat interface.
2. Decide whether a developer-managed API key is acceptable and set a budget/data policy.
3. Check the chosen account's current availability and authorization contract.
4. Prove one real inference request or one authenticated deployed MCP read/write flow.
5. Update the implementation plan around that verified route, then implement the next slice.

The discussion favored Claude + MCP when avoiding developer API keys is essential, or
Gemini API as a possible native-inbox starting point if a developer-managed key is accepted.
These are conditional recommendations, **not an accepted provider decision**. All external
availability statements above were checked on 16 November 2026 and must be rechecked on resume.
