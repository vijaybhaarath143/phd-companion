import { describe, expect, it } from "vitest";
import { z } from "zod";
import { decodeBase64, MAX_BASE64_CHARS, schemas, toPartialDate, type ToolName } from "@/server/mcp/schemas";
import { viaLabel } from "@/lib/labels";

const parse = (name: ToolName, input: unknown) => z.object(schemas[name]).safeParse(input);
const ID = "6f1c2a52-1f0e-4a6b-9a55-3c0e3a8f1d11";

describe("partial dates from an assistant", () => {
  it("keeps a day, a month, or no date — never invents a day", () => {
    expect(toPartialDate("2026-11-14")).toEqual({ date: "2026-11-14", precision: "day" });
    expect(toPartialDate("2027-01")).toEqual({ date: "2027-01-01", precision: "month" });
    expect(toPartialDate(undefined)).toEqual({ date: null, precision: "none" });
  });

  it("accepts YYYY-MM-DD and YYYY-MM, and rejects days that don't exist", () => {
    expect(parse("create_journal_entry", { title: "A", date: "2026-02-28" }).success).toBe(true);
    expect(parse("create_journal_entry", { title: "A", date: "2026-02" }).success).toBe(true);
    for (const bad of ["2026-02-30", "2026-13", "14/11/2026", "2026-1-5", "November 2026", "2026"]) {
      expect(parse("create_journal_entry", { title: "A", date: bad }).success, bad).toBe(false);
    }
  });
});

describe("checking tool inputs", () => {
  it("needs a title for entries and tasks", () => {
    expect(parse("create_journal_entry", { title: "  " }).success).toBe(false);
    expect(parse("create_task", {}).success).toBe(false);
    expect(parse("create_task", { title: "x".repeat(301) }).success).toBe(false);
    expect(parse("create_task", { title: "Revise intro", due_date: "2026-12-01", priority: "important" }).success).toBe(true);
  });

  it("only takes real ids", () => {
    expect(parse("get_project", { project_id: "1; drop table projects" }).success).toBe(false);
    expect(parse("get_project", { project_id: ID }).success).toBe(true);
  });

  it("only takes known categories, statuses and phases", () => {
    expect(parse("create_journal_entry", { title: "A", category: "guide_meeting" }).success).toBe(true);
    expect(parse("create_journal_entry", { title: "A", category: "party" }).success).toBe(false);
    expect(parse("update_task_status", { task_id: ID, status: "waiting", waiting_reason: "Guide's comments" }).success).toBe(true);
    expect(parse("update_task_status", { task_id: ID, status: "deleted" }).success).toBe(false);
    expect(parse("move_manuscript_to_phase", { manuscript_id: ID, phase: "under_review" }).success).toBe(true);
    expect(parse("move_manuscript_to_phase", { manuscript_id: ID, phase: "finished" }).success).toBe(false);
    expect(parse("list_tasks", { show: "all" }).success).toBe(false);
  });

  it("only takes web links", () => {
    expect(parse("add_link", { record_type: "entry", record_id: ID, url: "https://doi.org/10.1/x" }).success).toBe(true);
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "ftp://x.org/a", "not a link"]) {
      expect(parse("add_link", { record_type: "entry", record_id: ID, url }).success, url).toBe(false);
    }
  });

  it("only removes journal entries and tasks (to Trash)", () => {
    expect(parse("move_to_trash", { record_type: "task", record_id: ID }).success).toBe(true);
    expect(parse("move_to_trash", { record_type: "project", record_id: ID }).success).toBe(false);
  });

  it("takes only known timeline filters", () => {
    expect(parse("get_timeline", {}).success).toBe(true);
    expect(parse("get_timeline", { type: "manuscript", period: "year", limit: 20, project_id: ID }).success).toBe(true);
    expect(parse("get_timeline", { type: "party" }).success).toBe(false);
    expect(parse("get_timeline", { period: "week" }).success).toBe(false);
    expect(parse("get_timeline", { limit: 1000 }).success).toBe(false);
    expect(parse("get_timeline", { before: "2026-03-01" }).success).toBe(true);
    for (const bad of ["2026-03", "2026-02-30", "yesterday"]) expect(parse("get_timeline", { before: bad }).success, bad).toBe(false);
  });

  it("takes an optional request_id (a UUID) on every add, so retries don't duplicate", () => {
    for (const [tool, args] of [
      ["create_journal_entry", { title: "A" }],
      ["create_task", { title: "A" }],
      ["add_link", { record_type: "entry", record_id: ID, url: "https://doi.org/10.1/x" }],
      ["add_guide_feedback", { manuscript_id: ID, requested_changes: "x" }],
      ["add_file", { record_type: "entry", record_id: ID, filename: "a.txt", content_base64: "aGk=" }],
    ] as const) {
      expect(parse(tool, args).success, tool).toBe(true);
      expect(parse(tool, { ...args, request_id: ID }).success, tool).toBe(true);
      expect(parse(tool, { ...args, request_id: "retry-1" }).success, tool).toBe(false);
    }
  });

  it("refuses file content over the request size limit with a clear message", () => {
    const r = parse("add_file", { record_type: "entry", record_id: ID, filename: "a.pdf", content_base64: "A".repeat(MAX_BASE64_CHARS + 4) });
    expect(r.success).toBe(false);
    expect(r.error!.issues[0].message).toMatch(/about 3 MB/);
    expect(parse("add_file", { record_type: "entry", record_id: ID, filename: "a.pdf", content_base64: "A".repeat(MAX_BASE64_CHARS) }).success).toBe(true);
  });

  it("caps search and list sizes", () => {
    expect(parse("search", { query: "a" }).success).toBe(false);
    expect(parse("search", { query: "starch", limit: 500 }).success).toBe(false);
    expect(parse("list_journal_entries", { from_month: "2026-1" }).success).toBe(false);
    expect(parse("read_file_text", { file_id: ID, start: -5 }).success).toBe(false);
  });
});

describe("file content from an assistant", () => {
  it("decodes base64, with or without a data: prefix", () => {
    expect(Buffer.from(decodeBase64("aGVsbG8=")!).toString()).toBe("hello");
    expect(Buffer.from(decodeBase64("data:text/plain;base64,aGVs\nbG8=")!).toString()).toBe("hello");
  });
  it("rejects anything that isn't base64", () => {
    for (const bad of ["", "hello!", "aGVsbG8", "====", "aGVs*G8="]) expect(decodeBase64(bad), bad).toBeNull();
  });
});

describe("labels for what an assistant added", () => {
  it("names the assistant, and nothing for the app itself", () => {
    expect(viaLabel("chatgpt")).toBe("ChatGPT");
    expect(viaLabel("codex")).toBe("Codex");
    expect(viaLabel("mcp")).toBe("an assistant");
    expect(viaLabel("app")).toBeNull();
    expect(viaLabel(null)).toBeNull();
  });
});
