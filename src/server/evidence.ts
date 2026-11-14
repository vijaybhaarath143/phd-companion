import "server-only";
import type { Tx } from "@/server/db";

export type EvidenceItem = {
  id: string;
  kind: "file" | "link";
  url: string | null;
  label: string | null;
  filename: string | null;
  sizeBytes: number | null;
  mimeType: string | null;
};

/** Files and links shown on a record (hidden ones and failed uploads are left out). */
export async function evidenceFor(tx: Tx, parentType: "entry" | "project" | "manuscript", parentId: string) {
  return tx<EvidenceItem[]>`
    select id, kind, url, label, filename, size_bytes::int as size_bytes, mime_type
    from public.attachments
    where parent_type = ${parentType} and parent_id = ${parentId}
      and removed_at is null and replaced_by_id is null and status = 'verified'
    order by created_at`;
}
