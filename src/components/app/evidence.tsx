"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Download, FileText, ImageIcon, Link2, Loader2, Paperclip, Plus, X } from "lucide-react";
import { FilePreview, type PreviewFile } from "@/components/app/file-preview";
import { viaLabel } from "@/lib/labels";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/app/action-form";
import { addLink } from "@/server/actions/entries";
import { removeEvidence } from "@/server/actions/files";
import { uploadEvidence } from "@/lib/upload";
import { quickAction } from "@/components/app/call-action";
import { ACCEPT, ALLOWED_DESCRIPTION, formatBytes } from "@/lib/files";
import type { EvidenceItem } from "@/server/evidence";

type Parent = "entry" | "project" | "manuscript";

/**
 * Evidence on a record: private file uploads and links, in one list.
 * Files go straight from the browser to the person's own private folder through a
 * one-time link; the server then checks the file before it's shown.
 */
export function Evidence({ items, parentType, parentId, hint }: { items: EvidenceItem[]; parentType: Parent; parentId: string; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addingLink, setAddingLink] = useState(false);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<PreviewFile | null>(null);

  async function upload(files: File[]) {
    try {
      let added = 0;
      for (const [i, file] of files.entries()) {
        setBusy(files.length > 1 ? `Uploading ${i + 1} of ${files.length}: ${file.name}…` : `Uploading ${file.name}…`);
        const error = await uploadEvidence(parentType, parentId, file);
        if (error) toast.error(error);
        else added++;
      }
      if (added) toast.success(added === 1 ? "File added" : `${added} files added`);
    } catch (e) {
      // a dropped connection or an expired session mid-upload: say so instead of failing silently
      console.error(e);
      toast.error("Couldn't upload — check your connection and try again. Anything already uploaded is kept.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
      {items.length > 0 && (
        <ul className="flex flex-col gap-1">
          {items.map((it) => {
            const Icon = it.kind === "link" ? Link2 : it.mimeType?.startsWith("image/") ? ImageIcon : FileText;
            const name = it.label || it.filename || it.url || "File";
            return (
              <li key={it.id} className="flex min-h-10 items-center gap-2">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                {it.kind === "link" ? (
                  <a href={it.url!} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate underline underline-offset-4">
                    {name}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPreview({ id: it.id, name, filename: it.filename, sizeBytes: it.sizeBytes })}
                    className="min-w-0 truncate text-left underline underline-offset-4"
                    title="Preview"
                  >
                    {name}
                  </button>
                )}
                {it.kind === "file" && <span className="shrink-0 text-[12px] text-muted-foreground">{formatBytes(it.sizeBytes)}</span>}
                {viaLabel(it.createdVia) && <span className="shrink-0 text-[12px] text-muted-foreground">via {viaLabel(it.createdVia)}</span>}
                {it.kind === "file" && (
                  <a href={`/api/files/${it.id}`} download aria-label={`Download ${name}`} title="Download" className="ml-auto rounded p-1.5 text-muted-foreground hover:bg-muted">
                    <Download className="size-4" />
                  </a>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      if (!confirm("Remove this from the page? It's kept in your export, so nothing is lost.")) return;
                      await quickAction(() => removeEvidence(it.id));
                    })
                  }
                  className={cn("rounded p-1.5 text-muted-foreground hover:bg-muted", it.kind === "link" && "ml-auto")}
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <FilePreview file={preview} onClose={() => setPreview(null)} />

      {busy && (
        <p role="status" className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> {busy}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          id={`file-${parentId}`}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) void upload(files);
          }}
        />
        <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => input.current?.click()}>
          <Paperclip className="size-4" aria-hidden /> Add file
        </Button>
        {!addingLink && (
          <Button type="button" variant="ghost" onClick={() => setAddingLink(true)}>
            <Plus className="size-4" aria-hidden /> Add link
          </Button>
        )}
      </div>
      {addingLink && (
        <ActionForm action={addLink.bind(null, parentType, parentId)} success="Link added" onDone={() => setAddingLink(false)} className="flex flex-wrap gap-2">
          <Input name="url" type="url" required autoFocus placeholder="https://…" aria-label="Link" className="min-w-0 flex-[1_1_220px]" />
          <Input name="label" placeholder="Label (optional)" aria-label="Link label" className="min-w-0 flex-[1_1_140px]" />
          <Button type="submit" variant="outline">Add</Button>
          <Button type="button" variant="ghost" onClick={() => setAddingLink(false)}>Cancel</Button>
        </ActionForm>
      )}
      <p className="text-[12px] text-muted-foreground">{ALLOWED_DESCRIPTION}. Files are private to you.</p>
    </div>
  );
}
