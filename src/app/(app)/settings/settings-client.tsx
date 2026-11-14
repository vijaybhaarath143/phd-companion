"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ActionForm } from "@/components/app/action-form";
import { restoreFromTrash, setReminders, updateProfile } from "@/server/actions/settings";
import { monthNames } from "@/lib/dates";
import { TIMEZONES } from "@/lib/timezones";
import type { Profile } from "@/server/profile";

export function ProfileForm({ profile }: { profile: Profile }) {
  const year = new Date().getFullYear();
  return (
    <ActionForm action={updateProfile} success="Profile saved" reset={false} className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {([
          ["name", "Name", profile.displayName],
          ["university", "University", profile.university],
          ["department", "Department", profile.department],
          ["guide", "Research guide", profile.guideName],
        ] as const).map(([name, label, value]) => (
          <div key={name} className="flex flex-col gap-1.5">
            <label htmlFor={`s-${name}`} className="text-sm font-medium">{label}</label>
            <Input id={`s-${name}`} name={name} defaultValue={value ?? ""} />
          </div>
        ))}
      </div>
      <fieldset className="flex max-w-96 flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Programme start</legend>
        <div className="grid grid-cols-2 gap-2">
          <NativeSelect name="startMonth" aria-label="Month" defaultValue={profile.programmeStart?.slice(5, 7) ?? ""}>
            <option value="">Month</option>
            {monthNames.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
          </NativeSelect>
          <NativeSelect name="startYear" aria-label="Year" defaultValue={profile.programmeStart?.slice(0, 4) ?? ""}>
            <option value="">Year</option>
            {Array.from({ length: 12 }, (_, i) => String(year - i)).map((y) => <option key={y} value={y}>{y}</option>)}
          </NativeSelect>
        </div>
      </fieldset>
      <div className="flex max-w-96 flex-col gap-1.5">
        <label htmlFor="s-tz" className="text-sm font-medium">Time zone</label>
        <NativeSelect id="s-tz" name="timezone" defaultValue={profile.timezone}>
          {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
        </NativeSelect>
        <p className="text-[13px] text-muted-foreground">Used to decide what &ldquo;today&rdquo; and &ldquo;overdue&rdquo; mean.</p>
      </div>
      <Button type="submit" className="self-start">Save profile</Button>
    </ActionForm>
  );
}

export function RemindersToggle({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-start gap-2.5">
      <input type="checkbox" defaultChecked={enabled} disabled={pending} className="mt-0.5 size-[18px] accent-zinc-900"
        onChange={(e) => start(async () => { const r = await setReminders(e.target.checked); if (r.ok) toast.success("Saved"); else toast.error(r.error.message); })} />
      <span>Show a reminder bar when tasks are overdue</span>
    </label>
  );
}

export function TrashList({ items, kind }: { items: { table: "entries" | "tasks" | "projects"; id: string; title: string; deletedAt: Date }[]; kind: "trash" | "archive" }) {
  const [pending, start] = useTransition();
  if (!items.length) return null;
  const label = { entries: "Entry", tasks: "Task", projects: "Project" };
  return (
    <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border">
      {items.map((it) => (
        <li key={`${it.table}-${it.id}`} className="flex items-center gap-3 px-3 py-2">
          <span className="w-16 shrink-0 text-[12px] text-muted-foreground">{label[it.table]}</span>
          <span className="min-w-0 flex-1 truncate">{it.title}</span>
          <span className="hidden text-[12px] text-muted-foreground sm:inline">{kind === "trash" ? "deleted" : "archived"} {new Date(it.deletedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
          <Button size="sm" variant="outline" disabled={pending}
            onClick={() => start(async () => { const r = await restoreFromTrash(it.table, it.id); if (r.ok) toast.success("Restored"); else toast.error(r.error.message); })}>
            Restore
          </Button>
        </li>
      ))}
    </ul>
  );
}
