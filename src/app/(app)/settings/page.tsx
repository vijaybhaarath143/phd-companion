import type { Metadata } from "next";
import Link from "next/link";
import { asUser } from "@/server/auth";
import { requireProfile } from "@/server/profile";
import { signOut } from "@/server/actions/auth";
import { PageHeader } from "@/components/app/ui";
import { signInMode } from "@/lib/sign-in-mode";
import { formatTimestamp, todayIn } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { RestorableTable } from "@/server/actions/settings";
import { ConnectedApps, ProfileForm, RemindersToggle, TrashList } from "./settings-client";

export const metadata: Metadata = { title: "Settings" };

const PAGE = 50;

function Block({ title, hint, id, children }: { title: string; hint?: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-6 flex-wrap gap-x-8 gap-y-4 rounded-2xl border-2 bg-card shadow-edge p-5">
      <div className="max-w-72 flex-[1_1_220px]">
        <h2 className="text-[15px] font-extrabold">{title}</h2>
        {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex min-w-0 flex-[999_1_320px] flex-col gap-4">{children}</div>
    </section>
  );
}

/** "Show more" for a list: the same page with a longer list, everything else kept. */
function ShowMore({ sp, param, current, anchor }: { sp: Record<string, string | string[] | undefined>; param: string; current: number; anchor: string }) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== param) params.set(k, v);
  params.set(param, String(current + PAGE));
  return (
    <Link href={`/settings?${params.toString()}#${anchor}`} scroll={false} className="mt-2 inline-block text-[13px] font-medium underline-offset-4 hover:underline">
      Show more
    </Link>
  );
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const count = (v: unknown) => Math.min(Math.max(Math.trunc(Number(v)) || PAGE, PAGE), 5000);
  const trashLimit = count(sp.trash);
  const archiveLimit = count(sp.archive);

  const data = await asUser(async (tx, user) => {
    const profile = await requireProfile(tx);
    type Row = { table: RestorableTable; id: string; title: string; at: Date };
    const trash = await tx<Row[]>`
      select 'entries' as table, id, title, deleted_at as at from public.entries where deleted_at is not null
      union all select 'tasks', id, title, deleted_at from public.tasks where deleted_at is not null
      union all select 'courses', id, name, deleted_at from public.courses where deleted_at is not null
      union all select 'goals', id, title, deleted_at from public.goals where deleted_at is not null
      union all select 'notes', id, title, deleted_at from public.notes where deleted_at is not null
      order by at desc limit ${trashLimit + 1}`;
    const archived = await tx<Row[]>`
      select 'entries' as table, id, title, archived_at as at from public.entries where archived_at is not null and deleted_at is null
      order by archived_at desc limit ${archiveLimit + 1}`;
    return { profile, email: user.email, trash, archived };
  });
  // ChatGPT / Codex connections she approved (empty if the connector isn't switched on).
  const { data: grants } = await (await createSupabaseServer()).auth.oauth.listGrants();

  const tz = data.profile.timezone;
  // dates are written here, on her own clock, so the page reads the same before and after it loads
  const label = (rows: typeof data.trash, limit: number) => rows.slice(0, limit).map(({ at, ...r }) => ({ ...r, when: formatTimestamp(at, tz) }));
  const trash = label(data.trash, trashLimit);
  const archived = label(data.archived, archiveLimit);
  const lastExport = data.profile.lastExportAt;

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5">
      <PageHeader title="Settings" />

      <Block id="profile" title="Profile" hint="Your PhD title and details. Shown on Home, in the sidebar and in exports.">
        <ProfileForm profile={data.profile} thisYear={Number(todayIn(tz).slice(0, 4))} />
      </Block>

      <Block title="Reminders" hint="Shown inside the app only. No emails or phone notifications.">
        <RemindersToggle enabled={data.profile.remindersEnabled} />
      </Block>

      <Block title="Your data" hint="Everything you record belongs to you.">
        <div id="export" data-guide="export" className="flex scroll-mt-6 flex-wrap items-center justify-between gap-4">
          <div className="flex-[1_1_260px]">
            <p className="font-medium">Export everything</p>
            <p className="text-[13px] text-muted-foreground">One download with all your records and their history — spreadsheet files (CSV) you can open in Excel, plus a full copy (JSON) for safekeeping.</p>
            <p className="mt-1 text-[13px] text-zinc-700">
              {lastExport ? `Last export: ${formatTimestamp(lastExport, tz, { time: true })}.` : "Last export: never."}{" "}
              <span className="text-muted-foreground">Free hosting keeps no backups — download one weekly and keep it somewhere safe.</span>
            </p>
          </div>
          <Button asChild><a href="/api/export" download>Download export</a></Button>
        </div>
        <div id="archive" className="scroll-mt-6 border-t-2 border-zinc-100 pt-4">
          <p className="font-medium">Archive</p>
          <p className="text-[13px] text-muted-foreground">Archived entries and experiments are hidden from the Journal and Benchwork but kept. {archived.length ? "" : "Nothing archived."}</p>
          <TrashList items={archived} kind="archive" />
          {data.archived.length > archiveLimit && <ShowMore sp={sp} param="archive" current={archiveLimit} anchor="archive" />}
        </div>
        <div id="trash" data-guide="trash" className="scroll-mt-6 border-t-2 border-zinc-100 pt-4">
          <p className="font-medium">Trash</p>
          <p className="text-[13px] text-muted-foreground">Items in Trash can be restored. {trash.length ? "" : "Trash is empty."}</p>
          <TrashList items={trash} kind="trash" />
          {data.trash.length > trashLimit && <ShowMore sp={sp} param="trash" current={trashLimit} anchor="trash" />}
        </div>
      </Block>

      <Block title="Connected apps" hint="Assistants you allowed to read and add to your records, such as ChatGPT or Codex.">
        <ConnectedApps
          apps={(grants ?? []).map((g) => ({ id: g.client.id, name: g.client.name || "Unnamed app", connected: formatTimestamp(g.granted_at, tz) }))}
        />
      </Block>

      <Block title="Account">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-medium">Sign-in email</p>
            <p className="text-[13px] text-muted-foreground">{data.email} · {signInMode() === "code" ? "you sign in with a code" : "you sign in with a link sent to this address"}, no password</p>
          </div>
          <form action={signOut}><Button type="submit" variant="outline">Sign out</Button></form>
        </div>
      </Block>
    </div>
  );
}
