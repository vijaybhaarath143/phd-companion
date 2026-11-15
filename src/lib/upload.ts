"use client";

import { abandonUpload, finishUpload, startUpload } from "@/server/actions/files";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ALLOWED_DESCRIPTION, MAX_FILE_BYTES, isAllowedName } from "@/lib/files";

export type UploadParent = "entry" | "manuscript" | "trial";

/** Problem with a file before it's sent, in plain words — or null if it's fine. */
export function fileProblem(file: File): string | null {
  if (!isAllowedName(file.name)) return `“${file.name}” can't be added. You can add ${ALLOWED_DESCRIPTION}.`;
  if (file.size === 0) return `“${file.name}” is empty.`;
  if (file.size > MAX_FILE_BYTES) return `“${file.name}” is larger than 20 MB. Add a link to it instead.`;
  return null;
}

/**
 * Upload one file as evidence on a record: the server makes a one-time link to her
 * private folder, the browser sends the file straight to storage, then the server
 * checks what arrived. Returns an error message, or null when the file was added.
 */
export async function uploadEvidence(parentType: UploadParent, parentId: string, file: File): Promise<string | null> {
  const problem = fileProblem(file);
  if (problem) return problem;

  const started = await startUpload(parentType, parentId, { name: file.name, size: file.size });
  if (!started.ok) return started.error.message;

  const { error } = await supabaseBrowser().storage.from("evidence").uploadToSignedUrl(started.data.path, started.data.token, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (error) {
    await abandonUpload(started.data.id);
    return `“${file.name}” didn't finish uploading. Check your connection and try again.`;
  }

  const done = await finishUpload(started.data.id);
  return done.ok ? null : done.error.message;
}
