"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, ImageIcon, Link2, Loader2, Paperclip, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/app/action-form";
import { addLink } from "@/server/actions/entries";
import { abandonUpload, finishUpload, removeEvidence, startUpload } from "@/server/actions/files";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { ACCEPT, ALLOWED_DESCRIPTION, MAX_FILE_BYTES, formatBytes, isAllowedName } from "@/lib/files";
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

  async function upload(file: File) {
    if (!isAllowedName(file.name)) return void toast.error(`That type of file isn't supported. You can add ${ALLOWED_DESCRIPTION}.`);
    if (file.size > MAX_FILE_BYTES) return void toast.error("That file is larger than 20 MB. Add a link to it instead.");
    setBusy(`Uploading ${file.name}…`);
    try {
      const started = await startUpload(parentType, parentId, { name: file.name, size: file.size });
      if (!started.ok) return void toast.error(started.error.message);
      const { error } = await supabaseBrowser().storage.from("evidence").uploadToSignedUrl(started.data.path, started.data.token, file, {
        contentType: file.type || "application/octet-stream",
      });
      if (error) {
        await abandonUpload(started.data.id);
        return void toast.error("The upload didn't finish. Check your connection and try again.");
      }
      setBusy("Checking the file…");
      const done = await finishUpload(started.data.id);
      if (!done.ok) return void toast.error(done.error.message);
      toast.success("File added");
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
                <a
                  href={it.kind === "link" ? it.url! : `/api/files/${it.id}`}
                  target={it.kind === "link" ? "_blank" : undefined}
                  rel={it.kind === "link" ? "noreferrer noopener" : undefined}
                  className="min-w-0 truncate underline underline-offset-4"
                >
                  {name}
                </a>
                {it.kind === "file" && <span className="shrink-0 text-[12px] text-muted-foreground">{formatBytes(it.sizeBytes)}</span>}
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      if (!confirm("Remove this from the page? It's kept in your export, so nothing is lost.")) return;
                      const r = await removeEvidence(it.id);
                      if (!r.ok) toast.error(r.error.message);
                    })
                  }
                  className="ml-auto rounded p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

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
          className="sr-only"
          id={`file-${parentId}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
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
