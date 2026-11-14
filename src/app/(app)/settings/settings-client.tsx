"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ActionForm } from "@/components/app/action-form";
import { restoreFromTrash, setReminders, updateProfile, type RestorableTable } from "@/server/actions/settings";
import { quickAction } from "@/components/app/call-action";
import { disconnectApp } from "@/server/actions/connections";
import { monthNames } from "@/lib/dates";
import { TIMEZONES } from "@/lib/timezones";
import type { Profile } from "@/server/profile";

export function ProfileForm({ profile, thisYear }: { profile: Profile; thisYear: number }) {
  const startYear = profile.programmeStart?.slice(0, 4);
  const years = Array.from({ length: 16 }, (_, i) => String(thisYear - i));
  if (startYear && !years.includes(startYear)) years.push(startYear);
  return (
    <ActionForm action={updateProfile} success="Profile saved" reset={false} className="flex flex-col gap-4">
      <input type="hidden" name="version" value={profile.version} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {([
          ["name", "Name", profile.displayName],
          ["university", "University", profile.university],
          ["department", "Department", profile.department],
          ["guide", "Research guide", profile.guideName],
        ] as const).map(([name, label, value]) => (
          <div key={name} className="flex flex-col gap-1.5">
            <label htmlFor={`s-${name}`} className="text-sm font-medium">{label}</label>
            <Input id={`s-${name}`} name={name} maxLength={name === "name" ? 120 : 200} defaultValue={value ?? ""} />
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
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
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
        onChange={(e) => {
          const box = e.currentTarget;
          const next = box.checked;
          start(async () => { if (await quickAction(() => setReminders(next), () => (box.checked = !next))) toast.success("Saved"); });
        }} />
      <span>Show a reminder bar when tasks are overdue</span>
    </label>
  );
}

export function TrashList({ items, kind }: { items: { table: RestorableTable; id: string; title: string; when: string }[]; kind: "trash" | "archive" }) {
  const [pending, start] = useTransition();
  if (!items.length) return null;
  const label: Record<RestorableTable, string> = { entries: "Entry", tasks: "Task", projects: "Project", courses: "Course", goals: "Goal" };
  return (
    <ul className="mt-2 divide-y divide-zinc-100 rounded-lg border">
      {items.map((it) => (
        <li key={`${it.table}-${it.id}`} className="flex items-center gap-3 px-3 py-2">
          <span className="w-16 shrink-0 text-[12px] text-muted-foreground">{label[it.table]}</span>
          <span className="min-w-0 flex-1 truncate">{it.title}</span>
          <span className="hidden text-[12px] text-muted-foreground sm:inline">{kind === "trash" ? "deleted" : "archived"} {it.when}</span>
          <Button size="sm" variant="outline" disabled={pending}
            onClick={() => start(async () => { if (await quickAction(() => restoreFromTrash(it.table, it.id))) toast.success("Restored"); })}>
            Restore
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function ConnectedApps({ apps }: { apps: { id: string; name: string; connected: string }[] }) {
  const [pending, start] = useTransition();
  if (!apps.length) {
    return <p className="text-[13px] text-muted-foreground">None. To connect ChatGPT or Codex, add PhD Companion there — you&apos;ll approve it here first.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-zinc-100">
      {apps.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0">
          <div>
            <p className="font-medium">{a.name}</p>
            <p className="text-[13px] text-muted-foreground">Connected {a.connected}</p>
          </div>
          <Button variant="outline" size="sm" disabled={pending}
            onClick={() => start(async () => { if (await quickAction(() => disconnectApp(a.id))) toast.success(`${a.name} disconnected`); })}>
            Disconnect
          </Button>
        </li>
      ))}
    </ul>
  );
}
