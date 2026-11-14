"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppSelect } from "@/components/app/app-select";
import { toOptions } from "@/lib/options";
import { ActionForm } from "@/components/app/action-form";
import { createProject } from "@/server/actions/research";
import { projectTypes } from "@/lib/labels";

export function NewProjectForm() {
  return (
    <ActionForm action={createProject} reset={false} className="flex flex-col gap-4 rounded-xl border bg-card p-6">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="np-title" className="text-sm font-medium">Project title</label>
        <Input id="np-title" name="title" required maxLength={300} autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="np-type" className="text-sm font-medium">Type <span className="font-normal text-muted-foreground">(optional)</span></label>
        <AppSelect id="np-type" name="type" defaultValue="" options={toOptions(projectTypes, "Not sure")} />
      </div>
      <Button type="submit" className="self-end">Create project</Button>
    </ActionForm>
  );
}
