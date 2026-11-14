import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { currentUser } from "@/server/auth";
import { withUser, type SessionUser } from "@/server/db";
import { storageAsUser } from "@/server/storage";
import { toCsv } from "@/lib/csv";

// A large export (hundreds of MB of evidence) takes a while; it streams, so memory stays small.
export const maxDuration = 300;

const TABLES = [
  "profiles", "projects", "entries", "experiments", "experiment_revisions", "feedback", "enquiries", "events",
  "manuscripts", "manuscript_phase_events", "submissions", "submission_events", "blockers", "tasks", "goals",
  "requirements", "courses", "credit_recognitions", "milestones", "attachments",
] as const;

type Row = Record<string, unknown>;
type Bucket = NonNullable<Awaited<ReturnType<typeof storageAsUser>>>;

/**
 * "Export everything": every table (data.json + one CSV each), every stored evidence file,
 * and a manifest with each file's SHA-256. The ZIP is streamed as it's built — one file in
 * memory at a time — so it works however much she has stored. Files are stored as-is
 * (PDFs and images are already compressed); text is compressed.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const bucket = await storageAsUser();
  if (!bucket) return new Response("Not signed in", { status: 401 });

  const tables = await withUser(user, async (tx) => {
    const out: Record<string, Row[]> = {};
    for (const t of TABLES) {
      // search vectors are derived data; leave them out of the export
      out[t] = (await tx`select * from ${tx("public." + t)}`).map((row) => {
        const { search: _search, ...rest } = row as Row;
        return rest;
      });
    }
    return out;
  });

  const exportedAt = new Date().toISOString();
  const chunks = zipChunks(user, bucket, tables, exportedAt);
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (e) {
        console.error("export failed:", (e as Error).message);
        controller.error(e);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="phd-companion-export-${exportedAt.slice(0, 10)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function* zipChunks(user: SessionUser, bucket: Bucket, tables: Record<string, Row[]>, exportedAt: string) {
  const ready: Uint8Array[] = [];
  let failure: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) failure = err;
    else ready.push(chunk);
  });
  const add = (name: string, data: Uint8Array, compress: boolean) => {
    const entry = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
    zip.add(entry);
    entry.push(data, true);
  };
  function* drain() {
    if (failure) throw failure;
    while (ready.length) yield ready.shift()!;
  }

  add("data.json", strToU8(JSON.stringify({ format: "phd-companion-export", version: 1, exportedAt, tables }, null, 2)), true);
  yield* drain();
  for (const [t, rows] of Object.entries(tables)) {
    if (!rows.length) continue;
    add(`csv/${t}.csv`, strToU8(toCsv(rows)), true);
    yield* drain();
  }

  // Uploaded evidence, including files hidden from the page (they're kept, not erased).
  const fileList: { id: unknown; path: string; sha256: unknown; ok: boolean }[] = [];
  for (const a of tables.attachments) {
    if (a.kind !== "file" || a.status !== "verified" || typeof a.storagePath !== "string") continue;
    const path = `files/${a.id}/${a.filename}`;
    const { data: blob } = await bucket.download(a.storagePath);
    if (blob) {
      add(path, new Uint8Array(await blob.arrayBuffer()), false);
      yield* drain();
    }
    fileList.push({ id: a.id, path, sha256: a.sha256, ok: Boolean(blob) });
  }

  add("manifest.json", strToU8(JSON.stringify({
    format: "phd-companion-export",
    version: 1,
    exportedAt,
    counts: Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length])),
    files: fileList,
    notes: [
      "data.json is the complete copy, including history tables and date precision.",
      "Dates with precision 'month' are stored as the 1st of the month; the day is not known.",
      "files/ holds uploaded evidence; each file's SHA-256 is listed here so it can be checked.",
      fileList.some((f) => !f.ok) ? "Some files couldn't be read from storage (ok: false); try the export again." : "Every stored file is included.",
    ],
  }, null, 2)), true);
  zip.end();
  yield* drain();

  // Only once the whole ZIP has been sent: Home's weekly export reminder resets.
  await withUser(user, (tx) => tx`update public.profiles set last_export_at = now() where user_id = auth.uid()`);
}
