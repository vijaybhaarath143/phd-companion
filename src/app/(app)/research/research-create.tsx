"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionForm } from "@/components/app/action-form";
import { createExperiment, createManuscript } from "@/server/actions/research";

function InlineCreate({ label, placeholder, action, hidden }: { label: string; placeholder: string; action: (form: FormData) => Promise<unknown>; hidden?: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="size-3.5" aria-hidden /> {label}</Button>;
  return (
    <ActionForm action={action as (form: FormData) => Promise<void>} reset={false} className="flex w-full flex-wrap gap-2">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Input name="title" required autoFocus placeholder={placeholder} aria-label="Title" className="min-w-0 flex-[1_1_220px]" />
      <Button type="submit">Create</Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </ActionForm>
  );
}

export function NewPublication({ articleType }: { articleType: "review" | "original" }) {
  return (
    <InlineCreate
      label={articleType === "review" ? "Add review" : "Add article"}
      placeholder={articleType === "review" ? "SLR 3: …" : "Article title"}
      action={createManuscript}
      hidden={{ articleType }}
    />
  );
}

export function NewExperiment() {
  return <InlineCreate label="Add experiment" placeholder="Experiment title" action={createExperiment} />;
}
