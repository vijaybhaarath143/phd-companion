"use client";

import { useState } from "react";
import { FileText, ImageIcon, Link2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilePreview, type PreviewFile } from "@/components/app/file-preview";
import { useQuickAdd } from "@/components/app/quick-add";
import type { EvidenceItem } from "@/server/evidence";

/** Opens Quick Add; the new item shows up here once it's saved (the save refreshes the page). */
export function TimelineAddButton() {
  const { open } = useQuickAdd();
  return (
    <Button type="button" data-guide="timeline-add" onClick={() => open()}>
      <Plus className="size-4" aria-hidden /> Add
    </Button>
  );
}

/** A record's files and links, opened in place: files in the in-app preview, links in a new tab. */
export function TimelineFiles({ items }: { items: EvidenceItem[] }) {
  const [preview, setPreview] = useState<PreviewFile | null>(null);
  return (
    <>
      <ul className="relative z-10 mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
        {items.map((it) => {
          const Icon = it.kind === "link" ? Link2 : it.mimeType?.startsWith("image/") ? ImageIcon : FileText;
          const name = it.label || it.filename || it.url || "File";
          const cls = "flex min-h-8 max-w-full items-center gap-1.5 text-[13px] text-zinc-700 underline-offset-4 hover:text-foreground hover:underline";
          return (
            <li key={it.id} className="min-w-0 max-w-full">
              {it.kind === "link" ? (
                <a href={it.url!} target="_blank" rel="noreferrer noopener" className={cls}>
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{name}</span>
                </a>
              ) : (
                <button
                  type="button"
                  aria-label={`Preview ${name}`}
                  onClick={() => setPreview({ id: it.id, name, filename: it.filename, sizeBytes: it.sizeBytes })}
                  className={`${cls} text-left`}
                >
                  <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{name}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <FilePreview file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
