import { strToU8, zipSync } from "fflate";
import { createSupabaseServer } from "@/lib/supabase/server";
import { withUser } from "@/server/db";
import { toCsv } from "@/lib/csv";

const TABLES = [
  "profiles", "projects", "entries", "experiments", "experiment_revisions", "feedback", "enquiries", "events",
  "manuscripts", "manuscript_phase_events", "submissions", "blockers", "tasks", "goals", "requirements",
  "courses", "credit_recognitions", "milestones", "attachments",
] as const;

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
    files[`csv/${t}.csv`] = strToU8(toCsv(rows));
  }
  // Uploaded evidence, including files hidden from the page (they're kept, not erased).
  const fileList: { id: unknown; path: string; sha256: unknown; ok: boolean }[] = [];
  for (const a of tables.attachments) {
    if (a.kind !== "file" || a.status !== "verified" || typeof a.storagePath !== "string") continue;
    const path = `files/${a.id}/${a.filename}`;
    const { data: blob } = await supabase.storage.from("evidence").download(a.storagePath);
    if (blob) files[path] = new Uint8Array(await blob.arrayBuffer());
    fileList.push({ id: a.id, path, sha256: a.sha256, ok: Boolean(blob) });
  }

  files["manifest.json"] = strToU8(JSON.stringify({
    format: "phd-companion-export",
    version: 1,
    exportedAt,
    counts: Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length])),
    files: fileList,
    notes: [
      "data.json is the complete copy, including history tables and date precision.",
      "Dates with precision 'month' are stored as the 1st of the month; the day is not known.",
      "files/ holds uploaded evidence; each file's SHA-256 is listed here so it can be checked.",
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
