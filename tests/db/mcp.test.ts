import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SessionUser } from "@/server/db";
import { createConnectorServer } from "@/server/mcp/server";
import { connectorStatus, type ConnectorUser } from "@/server/mcp/auth";
import { admin, dropUser, makeUser, withUser } from "./helpers";
import { makeDocx, makePdf } from "../unit/fixtures";

/**
 * The connector runs every tool as the signed-in person, so row-level security keeps
 * one account's research away from another — whatever ids an assistant sends.
 */

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

/** A real access token for the user (used only to reach her private file storage). */
async function accessToken(email: string) {
  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const { data: s, error: e2 } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "email" });
  if (e2 || !s.session) throw e2 ?? new Error("no session");
  return s.session.access_token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tool results are checked field by field
type Json = any;
type Connected = { user: ConnectorUser; call: (name: string, args?: Record<string, unknown>) => Promise<{ text: string; isError: boolean; json: () => Json }> };

/** Connect "ChatGPT" for a user: a registered OAuth app and a sign-in session, as Supabase Auth would create them. */
async function connect(u: SessionUser, clientName: string): Promise<Connected> {
  const clientId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  await admin`insert into auth.oauth_clients (id, registration_type, redirect_uris, grant_types, client_name, client_type, token_endpoint_auth_method)
              values (${clientId}, 'dynamic', 'https://chatgpt.com/connector_platform_oauth_redirect', 'authorization_code,refresh_token', ${clientName}, 'public', 'none')`;
  await admin`insert into auth.sessions (id, user_id, created_at, updated_at, oauth_client_id) values (${sessionId}, ${u.id}, now(), now(), ${clientId})`;
  const user: ConnectorUser = { id: u.id, email: u.email, clientId, sessionId };
  const server = createConnectorServer({ user, token: await accessToken(u.email), origin: "https://phd.example" });
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return {
    user,
    call: async (name, args = {}) => {
      const r = await client.callTool({ name, arguments: args });
      const text = (r.content as { type: string; text: string }[]).map((c) => c.text).join("");
      return { text, isError: Boolean(r.isError), json: () => JSON.parse(text) };
    },
  };
}

let alice: SessionUser;
let bob: SessionUser;
let aliceGpt: Connected;
let bobGpt: Connected;
const ids: Record<string, string> = {};

beforeAll(async () => {
  alice = await makeUser("alice");
  bob = await makeUser("bob");
  await withUser(alice, async (tx) => {
    await tx`insert into public.profiles (user_id, display_name, onboarded_at) values (auth.uid(), 'Alice', now())`;
    const [p] = await tx`insert into public.projects (title) values ('Alice secret project') returning id`;
    ids.project = p.id;
    const [e] = await tx`insert into public.entries (title, description, entry_precision, project_id) values ('Alice private entry', 'unpublished starch result', 'none', ${p.id}) returning id`;
    ids.entry = e.id;
    const [x] = await tx`insert into public.entries (title, kind, entry_precision) values ('Alice experiment', 'experiment', 'none') returning id`;
    ids.experiment = x.id;
    await tx`insert into public.experiments (entry_id, procedure) values (${x.id}, 'secret procedure')`;
    const [m] = await tx`insert into public.manuscripts (title, project_id) values ('Alice manuscript', ${p.id}) returning id`;
    ids.manuscript = m.id;
    await tx`insert into public.manuscript_phase_events (manuscript_id, phase, kind) values (${m.id}, 'planning', 'change')`;
    const [t] = await tx`insert into public.tasks (title) values ('Alice task') returning id`;
    ids.task = t.id;
  });
  aliceGpt = await connect(alice, "ChatGPT");
  bobGpt = await connect(bob, "Codex");

  // Alice's assistant adds a file, so Bob can try to read it.
  const added = await aliceGpt.call("add_file", {
    record_type: "entry", record_id: ids.entry, filename: "results.pdf",
    content_base64: Buffer.from(makePdf("Alice confidential results")).toString("base64"),
  });
  expect(added.isError, added.text).toBe(false);
  ids.file = added.json().id;
});

afterAll(async () => {
  await admin`delete from auth.oauth_clients where id in (${aliceGpt.user.clientId}, ${bobGpt.user.clientId})`;
  await dropUser(alice);
  await dropUser(bob);
});

describe("an assistant connected to one account", () => {
  it("lists every tool, and marks the reading ones read-only", async () => {
    const server = createConnectorServer({ user: aliceGpt.user, token: "x", origin: "https://phd.example" });
    const client = new Client({ name: "t", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const { tools } = await client.listTools();
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly).toContain("search");
    expect(readOnly).toContain("read_file_text");
    expect(readOnly).toContain("get_timeline");
    expect(readOnly).not.toContain("create_task");
    for (const t of tools.filter((t) => t.name.startsWith("create_") || t.name.startsWith("add_") || t.name.startsWith("move_"))) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(false);
    }
  });

  it("reads her own records, with partial dates and links into the app", async () => {
    const r = await aliceGpt.call("search", { query: "starch" });
    expect(r.isError, r.text).toBe(false);
    expect(r.json().journal_entries[0]).toMatchObject({ title: "Alice private entry", date_label: "No date yet", link: `https://phd.example/journal/${ids.entry}` });
    const home = await aliceGpt.call("get_home_summary");
    expect(home.isError, home.text).toBe(false);
    const text = await aliceGpt.call("read_file_text", { file_id: ids.file });
    expect(text.isError, text.text).toBe(false);
    expect(text.json().text).toContain("Alice confidential results");
  });

  it("shows her timeline in date order, keeping partial dates", async () => {
    await withUser(alice, (tx) => tx`insert into public.entries (title, entry_date, entry_precision) values ('Alice conference', '2026-09-01', 'month'), ('Alice viva prep', '2026-10-05', 'day')`);
    const r = await aliceGpt.call("get_timeline", { type: "entry" });
    expect(r.isError, r.text).toBe(false);
    const t = r.json();
    const titles = t.items.map((i: { title: string }) => i.title);
    expect(titles.indexOf("Alice viva prep")).toBeLessThan(titles.indexOf("Alice conference"));
    expect(t.items.find((i: { title: string }) => i.title === "Alice conference")).toMatchObject({ date_precision: "month", date_label: "September 2026 · day not known" });
    expect(t.undated_items.map((i: { title: string }) => i.title)).toContain("Alice private entry");
    expect((await aliceGpt.call("get_timeline", { period: "month" })).json().undated_items).toEqual([]);
  });

  it("labels what it adds and changes with the assistant's name", async () => {
    const e = await aliceGpt.call("create_journal_entry", { title: "Met guide about chapter 2", date: "2026-10", category: "guide_meeting" });
    expect(e.isError, e.text).toBe(false);
    expect(e.json().date_label).toBe("October 2026 · day not known");
    const t = await aliceGpt.call("create_task", { title: "Send revised figures", from_entry_id: e.json().id });
    await aliceGpt.call("update_task_status", { task_id: ids.task, status: "waiting", waiting_reason: "Guide's comments" });
    await aliceGpt.call("move_manuscript_to_phase", { manuscript_id: ids.manuscript, phase: "writing", date: "2026-11-01" });
    const fb = await aliceGpt.call("add_guide_feedback", { manuscript_id: ids.manuscript, requested_changes: "Shorten abstract\nAdd error bars", make_tasks: true });
    expect(fb.json().tasks_created).toBe(2);

    const [entry] = await admin`select created_via, entry_precision, entry_date::text from public.entries where id = ${e.json().id}`;
    expect(entry).toEqual({ createdVia: "chatgpt", entryPrecision: "month", entryDate: "2026-10-01" });
    const [task] = await admin`select created_via from public.tasks where id = ${t.json().id}`;
    expect(task.createdVia).toBe("chatgpt");
    const [waiting] = await admin`select status, waiting_reason, changed_via, created_via from public.tasks where id = ${ids.task}`;
    expect(waiting).toEqual({ status: "waiting", waitingReason: "Guide's comments", changedVia: "chatgpt", createdVia: "app" });
    const [m] = await admin`select current_phase, changed_via from public.manuscripts where id = ${ids.manuscript}`;
    expect(m).toEqual({ currentPhase: "writing", changedVia: "chatgpt" });
    const [file] = await admin`select created_via, status, mime_type from public.attachments where id = ${ids.file}`;
    expect(file).toEqual({ createdVia: "chatgpt", status: "verified", mimeType: "application/pdf" });

    // Bob's assistant is Codex
    const b = await bobGpt.call("create_task", { title: "Bob's task" });
    const [bt] = await admin`select created_via from public.tasks where id = ${b.json().id}`;
    expect(bt.createdVia).toBe("codex");
  });

  it("checks that files really are what their names say", async () => {
    const r = await aliceGpt.call("add_file", {
      record_type: "entry", record_id: ids.entry, filename: "notes.pdf", content_base64: Buffer.from("MZ not a pdf").toString("base64"),
    });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/doesn't look like/);
    const docx = await aliceGpt.call("add_file", {
      record_type: "project", record_id: ids.project, filename: "Guide comments.docx", content_base64: Buffer.from(makeDocx(["Tighten the methods"])).toString("base64"),
    });
    expect(docx.isError, docx.text).toBe(false);
    const read = await aliceGpt.call("read_file_text", { file_id: docx.json().id });
    expect(read.json().text).toContain("Tighten the methods");
  });

  it("only moves things to Trash — nothing is erased", async () => {
    const t = await aliceGpt.call("create_task", { title: "Temporary" });
    const r = await aliceGpt.call("move_to_trash", { record_type: "task", record_id: t.json().id });
    expect(r.isError, r.text).toBe(false);
    const [row] = await admin`select deleted_at is not null as trashed from public.tasks where id = ${t.json().id}`;
    expect(row.trashed).toBe(true);
  });
});

describe("another account's assistant", () => {
  const notFound = /wasn't found|not found/i;

  it("can't find, list or open her records", async () => {
    const s = await bobGpt.call("search", { query: "Alice" });
    expect(s.text).not.toMatch(/Alice/);
    for (const [tool, args] of [
      ["get_journal_entry", { entry_id: ids.entry }],
      ["get_project", { project_id: ids.project }],
      ["get_manuscript", { manuscript_id: ids.manuscript }],
      ["get_experiment", { experiment_id: ids.experiment }],
      ["list_files_and_links", { record_type: "entry", record_id: ids.entry }],
      ["read_file_text", { file_id: ids.file }],
    ] as const) {
      const r = await bobGpt.call(tool, args);
      expect(r.isError, tool).toBe(true);
      expect(r.text, tool).toMatch(notFound);
      expect(r.text, tool).not.toMatch(/Alice|secret|confidential/);
    }
    for (const tool of ["list_projects", "list_manuscripts", "list_experiments", "list_tasks", "list_goals", "get_academics", "list_journal_entries", "get_home_summary", "get_timeline"]) {
      const r = await bobGpt.call(tool);
      expect(r.isError, `${tool}: ${r.text}`).toBe(false);
      expect(r.text, tool).not.toMatch(/Alice/);
    }
    // filtering the timeline by her project id shows nothing either
    const byProject = await bobGpt.call("get_timeline", { project_id: ids.project });
    expect(byProject.json().items).toEqual([]);
    expect(byProject.json().undated_items).toEqual([]);
  });

  it("can't change, attach to or trash her records", async () => {
    const attempts: [string, Record<string, unknown>][] = [
      ["update_task_status", { task_id: ids.task, status: "done" }],
      ["add_link", { record_type: "entry", record_id: ids.entry, url: "https://evil.example" }],
      ["add_guide_feedback", { manuscript_id: ids.manuscript, requested_changes: "x" }],
      ["move_manuscript_to_phase", { manuscript_id: ids.manuscript, phase: "stopped" }],
      ["add_file", { record_type: "entry", record_id: ids.entry, filename: "x.txt", content_base64: Buffer.from("hi").toString("base64") }],
      ["move_to_trash", { record_type: "entry", record_id: ids.entry }],
      ["create_task", { title: "sneaky", project_id: ids.project }],
      ["create_journal_entry", { title: "sneaky", project_id: ids.project }],
    ];
    for (const [tool, args] of attempts) {
      const r = await bobGpt.call(tool, args);
      expect(r.isError, `${tool}: ${r.text}`).toBe(true);
    }
    const [task] = await admin`select status from public.tasks where id = ${ids.task}`;
    expect(task.status).toBe("waiting");
    const [m] = await admin`select current_phase from public.manuscripts where id = ${ids.manuscript}`;
    expect(m.currentPhase).toBe("writing");
    const [e] = await admin`select deleted_at from public.entries where id = ${ids.entry}`;
    expect(e.deletedAt).toBeNull();
    const [{ n }] = await admin`select count(*)::int as n from public.attachments where parent_id = ${ids.entry} and owner_id = ${bob.id}`;
    expect(n).toBe(0);
  });

  it("can't use her connection's session", async () => {
    // Bob's identity with Alice's session id: not active.
    expect((await connectorStatus({ ...bobGpt.user, sessionId: aliceGpt.user.sessionId })).active).toBe(false);
    expect((await connectorStatus(aliceGpt.user)).active).toBe(true);
  });
});

describe("disconnecting an assistant", () => {
  it("stops its token working straight away", async () => {
    const extra = await connect(alice, "ChatGPT");
    expect(await connectorStatus(extra.user)).toEqual({ active: true, source: "chatgpt" });
    await admin`delete from auth.sessions where id = ${extra.user.sessionId}`; // what revoking the grant does
    expect((await connectorStatus(extra.user)).active).toBe(false);
    await admin`delete from auth.oauth_clients where id = ${extra.user.clientId}`;
  });
});
