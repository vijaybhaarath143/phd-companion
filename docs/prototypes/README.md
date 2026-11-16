# Ask Sprig chat prototype

[Open the prototype source](chat-flow.html). Download the HTML and open it in a browser,
or serve it locally using the command below. GitHub's file viewer displays the source;
it does not execute the prototype.

This is a self-contained design prototype for native chat in PhD Companion. It includes
a **14-step guided journey**, **42 selectable UI cases**, and a clickable flow map.
It uses fictional records and simulated responses. The prototype does not connect to
ChatGPT, upload files, or write research data. All changes remain in memory and reset
when the page reloads.

## Run locally

From the repository root:

```bash
python3 -m http.server 8080 --bind 127.0.0.1 --directory docs/prototypes
```

Open [the walkthrough](http://127.0.0.1:8080/chat-flow.html). No package installation,
Supabase instance, or model credentials are needed.

## Explore the flow

- **Guided journey:** follow setup, permission review, new chat, context, evidence,
  streamed answers, sources, proposed tasks, editing, approval, saved records, and resume.
- **All UI cases:** explore setup (8), inbox (6), chat (9), sources and files (6),
  approvals (10), and resume/mobile (3).
- **Flow map:** select a stage to open its actual screen, or jump into a branch group.
- **Reset preview:** restore the current case to its initial state.

Product buttons are interactive. Stop and continue a reply, inspect a source, edit or
decline a proposal, approve tasks, recover a failed save, rename/archive/restore a
conversation, and switch between the inbox and a thread on mobile.

The reviewer strip is outside the proposed product UI. For a case held mid-stream or
mid-save, its **Finish now** control completes that simulated step without waiting.

Cases can be opened directly with a URL fragment, for example:

```text
http://127.0.0.1:8080/chat-flow.html#proposal-conflict&tab=cases
http://127.0.0.1:8080/chat-flow.html#source-unavailable&tab=cases
http://127.0.0.1:8080/chat-flow.html#mobile-navigation&tab=cases
```

## Design and validation notes

- Designed with Claude Opus 5.5 using the application's Sprig artwork, colors, and
  component styling at repository revision `cad160b`.
- Task due dates are exact days or unset. A month-only target is retained as a note,
  without inventing a due day.
- Saving requires explicit approval. Conflict, retry, unknown-outcome, and partial
  recovery examples show the proposed interaction contracts.
- Model connection screens are simulations. Hosted subscription access still needs
  to be established for a real implementation.
- All 42 case layouts were checked at 360, 728, and 1000 pixels. The guided journey,
  approval/edit/conflict/retry/receipt recovery, source access, draft preservation, and
  mobile navigation were exercised.
- The prototype uses a light product theme. Screen-reader output and a real OS
  file-picker dialog have not been verified. Choosing a local file records its name
  only; no file content leaves the browser.

For deterministic design inspection, `window.pcFlowDemo` exposes `listCases()`,
`journey()`, `selectCase(id)`, `getState()`, `reset()`, and `settle()`. These helpers
belong only to the prototype.
