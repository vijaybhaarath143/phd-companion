import type { Metadata } from "next";
import { asUser } from "@/server/auth";
import { requireProfile } from "@/server/profile";
import { signOut } from "@/server/actions/auth";
import { PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { ProfileForm, RemindersToggle, TrashList } from "./settings-client";

export const metadata: Metadata = { title: "Settings" };

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-wrap gap-x-8 gap-y-4 rounded-xl border bg-card p-5">
      <div className="max-w-72 flex-[1_1_220px]">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex min-w-0 flex-[999_1_320px] flex-col gap-4">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const data = await asUser(async (tx, user) => {
    const profile = await requireProfile(tx);
    const trash = await tx<{ table: "entries" | "tasks" | "projects"; id: string; title: string; deletedAt: Date }[]>`
      select 'entries' as table, id, title, deleted_at from public.entries where deleted_at is not null
      union all select 'tasks', id, title, deleted_at from public.tasks where deleted_at is not null
      union all select 'projects', id, title, deleted_at from public.projects where deleted_at is not null
      order by deleted_at desc limit 50`;
    const archived = await tx<{ table: "entries" | "tasks" | "projects"; id: string; title: string; deletedAt: Date }[]>`
      select 'entries' as table, id, title, archived_at as deleted_at from public.entries where archived_at is not null and deleted_at is null
      order by archived_at desc limit 50`;
    return { profile, email: user.email, trash, archived };
  });

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5">
      <PageHeader title="Settings" />

      <Block title="Profile" hint="Shown on Home and in exports.">
        <ProfileForm profile={data.profile} />
      </Block>

      <Block title="Reminders" hint="Shown inside the app only. No emails or phone notifications.">
        <RemindersToggle enabled={data.profile.remindersEnabled} />
      </Block>

      <Block title="Your data" hint="Everything you record belongs to you.">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex-[1_1_260px]">
            <p className="font-medium">Export everything</p>
            <p className="text-[13px] text-muted-foreground">One download with all your records and their history — spreadsheet files (CSV) you can open in Excel, plus a full copy (JSON) for safekeeping.</p>
          </div>
          <Button asChild><a href="/api/export" download>Download export</a></Button>
        </div>
        <div className="border-t border-zinc-100 pt-4">
          <p className="font-medium">Archive</p>
          <p className="text-[13px] text-muted-foreground">Archived entries are hidden from the Journal but kept. {data.archived.length ? "" : "Nothing archived."}</p>
          <TrashList items={data.archived} kind="archive" />
        </div>
        <div className="border-t border-zinc-100 pt-4">
          <p className="font-medium">Trash</p>
          <p className="text-[13px] text-muted-foreground">Items in Trash can be restored. {data.trash.length ? "" : "Trash is empty."}</p>
          <TrashList items={data.trash} kind="trash" />
        </div>
      </Block>

      <Block title="Account">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Sign-in email</p>
            <p className="text-[13px] text-muted-foreground">{data.email} · you sign in with a code, no password</p>
          </div>
          <form action={signOut}><Button type="submit" variant="outline">Sign out</Button></form>
        </div>
      </Block>
    </div>
  );
}
