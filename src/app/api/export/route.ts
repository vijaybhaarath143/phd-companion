import { strToU8, zipSync } from "fflate";
import { createSupabaseServer } from "@/lib/supabase/server";
import { withUser } from "@/server/db";

const TABLES = [
  "profiles", "projects", "entries", "experiments", "experiment_revisions", "feedback", "enquiries", "events",
  "manuscripts", "manuscript_phase_events", "submissions", "blockers", "tasks", "goals", "requirements",
  "courses", "credit_recognitions", "milestones", "attachments",
] as const;

/** CSV cell, with formula-looking values escaped so spreadsheets don't run them. */
function cell(v: unknown) {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return new Response("Not signed in", { status: 401 });
  const user = { id: data.claims.sub, email: String(data.claims.email ?? "") };

  const tables = await withUser(user, async (tx) => {
    const out: Record<string, Record<string, unknown>[]> = {};
    for (const t of TABLES) {
      // search vectors are derived data; leave them out of the export
      out[t] = (await tx`select * from ${tx("public." + t)}`).map((row) => {
        const { search: _search, ...rest } = row as Record<string, unknown>;
        return rest;
      });
    }
    return out;
  });

  const files: Record<string, Uint8Array> = {};
  const exportedAt = new Date().toISOString();
  files["data.json"] = strToU8(JSON.stringify({ format: "phd-companion-export", version: 1, exportedAt, tables }, null, 2));
  for (const [t, rows] of Object.entries(tables)) {
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    files[`csv/${t}.csv`] = strToU8("﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n"));
  }
  files["manifest.json"] = strToU8(JSON.stringify({
    format: "phd-companion-export",
    version: 1,
    exportedAt,
    counts: Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length])),
    notes: [
      "data.json is the complete copy, including history tables and date precision.",
      "Dates with precision 'month' are stored as the 1st of the month; the day is not known.",
      "Uploaded files are not included yet — evidence is stored as links.",
    ],
  }, null, 2));

  const zip = zipSync(files, { level: 6 });
  const day = exportedAt.slice(0, 10);
  return new Response(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="phd-companion-export-${day}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}
