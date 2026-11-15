import Link from "next/link";
import { BookOpen, CalendarDays, Download, FlaskConical, History, Search } from "lucide-react";
import { asUser } from "@/server/auth";
import { requireProfile } from "@/server/profile";
import { getAreas, getHome, getHomeCalendar, getRecentUpdates, getReminders, needsBackupReminder } from "@/server/home";
import { formatTimestamp, greeting, longToday, monthLabel, todayIn } from "@/lib/dates";
import { CreditBar } from "@/components/app/credit-bar";
import { StepBar } from "@/components/app/step-bar";
import { Areas, MiniMonth, RecentUpdates, Reminders } from "@/components/app/home-panels";
import { Empty, IconLink, PageHeader, RowLink, Rows, Section } from "@/components/app/ui";
import { GuideInvite } from "@/components/app/guide";
import { QuickAddButton } from "@/components/app/quick-add";
import { Button } from "@/components/ui/button";

/** One calm line, weekly: the free hosting keeps no backups, so her export is the backup. */
function BackupReminder({ lastExportAt, tz }: { lastExportAt: Date | null; tz: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border-2 bg-card shadow-edge px-5 py-3 text-[13px] text-zinc-700">
      <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex-[1_1_240px]">
        Free hosting keeps no backups — download an export weekly.
        <span className="text-muted-foreground"> {lastExportAt ? `Last export: ${formatTimestamp(lastExportAt, tz)}.` : "No export yet."}</span>
      </span>
      <Link href="/settings#export" className="font-medium underline-offset-4 hover:underline">Settings → Export</Link>
    </p>
  );
}

function Attention({ home }: { home: Awaited<ReturnType<typeof getHome>> }) {
  return (
    <Section guide="attention" title="Needs attention" action={home.attentionTotal > 0 && <span className="text-[13px] text-muted-foreground">{home.attentionTotal} {home.attentionTotal === 1 ? "item" : "items"}</span>}>
      {home.attention.length ? (
        <Rows>{home.attention.map((a, i) => <RowLink key={i} href={a.href} title={a.title} detail={a.detail} badge={a.badge} attention={a.attention} />)}</Rows>
      ) : (
        <Empty>Nothing needs you right now.</Empty>
      )}
    </Section>
  );
}

export default async function HomePage() {
  const { profile, home, reminders, calendar, updates, areas } = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    const today = todayIn(profile.timezone);
    return {
      profile,
      home: await getHome(tx, today),
      reminders: await getReminders(tx, today),
      calendar: await getHomeCalendar(tx, today),
      updates: await getRecentUpdates(tx, today, profile.timezone),
      areas: await getAreas(tx),
    };
  });
  const tz = profile.timezone;
  const name = profile.displayName?.split(" ")[0];
  const backup = needsBackupReminder(profile.lastExportAt, !home.isEmpty) && <BackupReminder lastExportAt={profile.lastExportAt} tz={tz} />;

  if (home.isEmpty) {
    return (
      <div className="mx-auto flex max-w-[960px] flex-col gap-6">
        <PageHeader eyebrow={longToday(tz)} title={name ? `Welcome, ${name}` : "Welcome"} />
        <GuideInvite />
        {home.attention.length > 0 && <Attention home={home} />}
        <section className="flex flex-col items-center gap-4 rounded-2xl border-2 bg-card shadow-edge px-8 py-10 text-center">
          <div aria-hidden className="flex size-14 items-center justify-center rounded-2xl bg-leaf-soft">
            <BookOpen className="size-7 text-primary" />
          </div>
          <div className="flex max-w-[460px] flex-col gap-1.5">
            <h2 className="text-lg font-extrabold">Record your first entry</h2>
            <p className="text-muted-foreground">Anything that happened — a meeting, a reading, an experiment, a deadline. A title and a date are enough.</p>
          </div>
          <QuickAddButton label="Quick Add" variant="default" />
        </section>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          <Section guide="working-on" title="Your projects" action={<IconLink href="/research" label="Open Research"><FlaskConical /></IconLink>}>
            {home.workingOn.length ? (
              <Rows>{home.workingOn.map((p) => <RowLink key={p.id} href={p.href} title={p.title} detail="No entries yet" />)}</Rows>
            ) : (
              <Empty>No projects yet.</Empty>
            )}
          </Section>
          <Section title="Requirements" padded>
            <p className="text-muted-foreground">Not set up yet. Add your credit requirement and milestones whenever you&apos;re ready.</p>
            <Button asChild variant="outline" className="mt-4"><Link href="/academics">Set up requirements</Link></Button>
          </Section>
        </div>
      </div>
    );
  }

  const c = home.credits?.summary;
  return (
    <div className="mx-auto flex max-w-[1060px] flex-col gap-6">
      <PageHeader eyebrow={longToday(tz)} title={greeting(tz) + (name ? `, ${name}` : "")} actions={<QuickAddButton label="Quick Add" variant="default" />} />
      <GuideInvite />
      {backup}
      <Link href="/journal?search=1" data-guide="search" className="flex h-11 items-center gap-2 rounded-xl border-2 bg-card px-3.5 text-muted-foreground md:hidden">
        <Search className="size-4" aria-hidden /> Search everything
      </Link>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[3_1_440px] flex-col gap-4">
          <Section guide="reminders" title="Reminders" action={<span className="text-[13px] text-muted-foreground">Tasks, deadlines and events, by date</span>}>
            <Reminders groups={reminders} />
          </Section>

          {home.attention.length > 0 && <Attention home={home} />}

          <Section guide="working-on" title="Working on" action={<IconLink href="/research" label="All research"><FlaskConical /></IconLink>}>
            {home.workingOn.length ? (
              <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
                {home.workingOn.map((p) => (
                  <li key={p.id}>
                    <Link href={p.href} className="block px-5 py-3 transition-colors hover:bg-zinc-50">
                      <span className="block font-medium">{p.title}</span>
                      <span className="block text-[13px] text-muted-foreground">{p.detail}</span>
                      {p.steps && <StepBar done={p.steps.done} total={p.steps.total} currentNo={p.steps.currentNo} className="mt-2" />}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No active projects. <Link href="/research" className="underline">Add one</Link>.</Empty>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
          <Section padded guide="home-calendar" title={monthLabel(calendar.month)} action={<IconLink href="/planner?view=calendar" label="Open calendar"><CalendarDays /></IconLink>}>
            <MiniMonth cal={calendar} />
          </Section>

          <Section title="Recent updates" action={<IconLink href="/timeline" label="Open timeline"><History /></IconLink>}>
            <RecentUpdates items={updates} />
          </Section>

          <Section padded title={home.credits?.label ?? "Coursework credits"} action={home.credits?.period && <span className="text-[13px] text-muted-foreground">{home.credits.period}</span>}>
            {c ? (
              <>
                <CreditBar summary={c} />
                {c.incomplete && <p className="mt-2 text-[13px] text-muted-foreground">Totals are incomplete until every course has a credit value.</p>}
              </>
            ) : (
              <p className="text-muted-foreground">Not set up yet.</p>
            )}
            <Link href="/academics" className="mt-3 inline-block text-[13px] underline-offset-4 hover:underline">Open Academics</Link>
          </Section>

          <Section guide="areas" title="Your areas">
            <Areas areas={areas} />
          </Section>
        </div>
      </div>
    </div>
  );
}
