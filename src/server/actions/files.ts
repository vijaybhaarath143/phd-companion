"use server";

import { createHash } from "node:crypto";
import { refresh } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { run, ValidationError, oneOf, uuidOrNull } from "@/server/actions/run";
import { fail } from "@/lib/result";
import { MAX_FILE_BYTES, isAllowedName, safeFileName, sniff, ALLOWED_DESCRIPTION } from "@/lib/files";

const BUCKET = "evidence";
const PARENTS = ["entry", "project", "manuscript", "course", "milestone"] as const;

/**
 * Step 1 of an upload: record the file as "pending" and get a one-time upload link
 * for the person's own private folder. The browser sends the file straight to storage.
 */
export async function startUpload(parentType: string, parentId: string, file: { name: string; size: number }) {
  return run(async (tx, user) => {
    const parent = oneOf(parentType, PARENTS);
    const pid = uuidOrNull(parentId);
    if (!parent || !pid) throw new ValidationError("Something went wrong — please try again.");
    if (!isAllowedName(file.name)) throw new ValidationError(`That type of file isn't supported. You can add ${ALLOWED_DESCRIPTION}.`);
    if (!(file.size > 0)) throw new ValidationError("That file is empty.");
    if (file.size > MAX_FILE_BYTES) throw new ValidationError("That file is larger than 20 MB. Add a link to it instead.");

    const id = crypto.randomUUID();
    const filename = safeFileName(file.name);
    const path = `${user.id}/${id}/${filename}`;
    await tx`
      insert into public.attachments (id, parent_type, parent_id, kind, storage_path, filename, label, size_bytes, status)
      values (${id}, ${parent}, ${pid}, 'file', ${path}, ${filename}, ${file.name.slice(0, 200)}, ${file.size}, 'pending')`;

    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(`Could not prepare upload: ${error?.message}`);
    return { id, path: data.path, token: data.token };
  });
}

/**
 * Step 2: check what actually arrived — size, real file type (by its first bytes,
 * not its name) and a SHA-256 fingerprint — before showing it as evidence.
 */
export async function finishUpload(attachmentId: string) {
  const r = await run(async (tx) => {
    const [a] = await tx<{ storagePath: string; filename: string }[]>`
      select storage_path, filename from public.attachments where id = ${attachmentId} and kind = 'file' and status = 'pending'`;
    if (!a) throw new ValidationError("Upload not found.");

    const supabase = await createSupabaseServer();
    const { data, error } = await supabase.storage.from(BUCKET).download(a.storagePath);
    const bytes = data ? new Uint8Array(await data.arrayBuffer()) : null;
    const mime = bytes ? sniff(bytes, a.filename) : null;

    if (error || !bytes || bytes.length > MAX_FILE_BYTES || !mime) {
      // Record the failure and return normally: throwing here would roll the "failed" mark back.
      await tx`update public.attachments set status = 'failed' where id = ${attachmentId}`;
      if (bytes) await supabase.storage.from(BUCKET).remove([a.storagePath]);
      return {
        rejected: !bytes ? "The upload didn't arrive. Please try again." : !mime ? "That file doesn't look like the type its name says. It wasn't added." : "That file is larger than 20 MB.",
      };
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await tx`update public.attachments set status = 'verified', mime_type = ${mime}, size_bytes = ${bytes.length}, sha256 = ${sha256}
             where id = ${attachmentId}`;
    return { rejected: null };
  });
  if (r.ok && r.data.rejected) return fail("validation", r.data.rejected);
  if (r.ok) refresh();
  return r;
}

/** The browser couldn't send the file: mark the pending record failed so it doesn't linger. */
export async function abandonUpload(attachmentId: string) {
  return run(async (tx) => {
    await tx`update public.attachments set status = 'failed' where id = ${attachmentId} and status = 'pending'`;
  });
}

/** Hide a file or link from the page. Files are kept (and stay in the export) — nothing is erased. */
export async function removeEvidence(attachmentId: string) {
  return run(async (tx) => {
    await tx`update public.attachments set removed_at = now() where id = ${attachmentId}`;
    refresh();
  });
}
