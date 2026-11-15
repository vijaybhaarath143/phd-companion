import Link from "next/link";
import { Ban, Building2, CalendarDays, Download, FileText, FlaskConical, GraduationCap, History, Hourglass, MessageSquare, Search, type LucideIcon } from "lucide-react";
import { asUser } from "@/server/auth";
import { requireProfile } from "@/server/profile";
import { getAreas, getHome, getHomeCalendar, getRecentUpdates, getReminders, needsBackupReminder } from "@/server/home";
import { formatTimestamp, greeting, longToday, monthLabel, todayIn } from "@/lib/dates";
import { CreditBar } from "@/components/app/credit-bar";
import { PhaseBar, StepBar } from "@/components/app/step-bar";
import { Areas, MiniMonth, RecentUpdates, Reminders } from "@/components/app/home-panels";
import { Empty, IconLink, IconTile, PageHeader, RowLink, Rows, Section, type AreaTone } from "@/components/app/ui";
import { LiveSprig } from "@/components/app/sprig-live";
import { Badge } from "@/components/ui/badge";
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

type Home = Awaited<ReturnType<typeof getHome>>;

/** What each "needs you" item is, by its badge: an icon and a colour that mean the same everywhere. */
const NEEDS: Record<string, { icon: LucideIcon; tone: AreaTone; badge: "attention" | "grape" | "outline" }> = {
  Open: { icon: MessageSquare, tone: "sun", badge: "attention" },
  Waiting: { icon: Hourglass, tone: "sun", badge: "attention" },
  "Follow up": { icon: Building2, tone: "sun", badge: "attention" },
  Blocked: { icon: Ban, tone: "sun", badge: "attention" },
  Journal: { icon: CalendarDays, tone: "sun", badge: "attention" },
  Academics: { icon: GraduationCap, tone: "grape", badge: "grape" },
};

function NeedsYou({ home }: { home: Home }) {
  return (
    <Section
      guide="attention"
      title="Needs you"
      action={home.attentionTotal > 0 && <Badge variant="attention">{home.attentionTotal} {home.attentionTotal === 1 ? "item" : "items"}</Badge>}
    >
      {home.attention.length ? (
        <ul className="flex flex-col gap-0.5 px-2 pb-2">
          {home.attention.map((a, i) => {
            const n = NEEDS[a.badge ?? ""] ?? { icon: FileText, tone: "neutral" as const, badge: "outline" as const };
            return (
              <li key={i}>
                <Link href={a.href} className="flex items-center gap-3.5 rounded-xl px-3 py-2.5 transition-colors hover:bg-zinc-50">
                  <IconTile tone={n.tone}><n.icon strokeWidth={2.4} /></IconTile>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[15px] leading-snug font-extrabold">{a.title}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{a.detail}</span>
                  </span>
                  {a.badge && <Badge variant={n.badge}>{a.badge}</Badge>}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty sprig="cosy">Nothing needs you today. Nice.</Empty>
      )}
    </Section>
  );
}

/** One "Working on" card: a review with its steps, an article with its phase, or benchwork. */
function WorkCard({ item }: { item: Home["workingOn"][number] }) {
  const look =
    item.kind === "review"
      ? { label: "Review article", tone: "sky" as const, icon: Search }
      : item.kind === "benchwork"
        ? { label: "Benchwork", tone: "leaf" as const, icon: FlaskConical }
        : { label: "Original article", tone: "leaf" as const, icon: FileText };
  return (
    <Link href={item.href} className="flex flex-col gap-3.5 rounded-2xl border-2 bg-card p-5 shadow-edge transition-colors hover:bg-zinc-50">
      <span className="flex items-center gap-3">
        <IconTile tone={look.tone}><look.icon strokeWidth={2.4} /></IconTile>
        <span className="font-display text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{look.label}</span>
      </span>
      <span className="font-display text-lg leading-snug font-black text-balance">{item.title}</span>
      {item.steps ? (
        <StepBar done={item.steps.done} total={item.steps.total} currentNo={item.steps.currentNo} />
      ) : item.phase && item.phase !== "stopped" ? (
        <PhaseBar phase={item.phase} />
      ) : null}
      <span className="text-[13px] text-muted-foreground">{item.detail}</span>
    </Link>
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
        <PageHeader eyebrow={longToday(tz)} title={name ? `Welcome, ${name}` : "Welcome"} subtitle={profile.phdTitle ?? undefined} />
        <GuideInvite />
        {home.attention.length > 0 && <NeedsYou home={home} />}
        <section className="flex flex-col items-center gap-4 rounded-2xl border-2 bg-card shadow-edge px-8 py-10 text-center">
          <LiveSprig stage="seed" className="w-24" />
          <div className="flex max-w-[460px] flex-col gap-1.5">
            <h2 className="text-lg font-extrabold">Record your first entry</h2>
            <p className="text-muted-foreground">Anything that happened — a meeting, a reading, an experiment, a deadline. A title and a date are enough.</p>
          </div>
          <QuickAddButton label="Quick Add" variant="default" />
        </section>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          <Section guide="working-on" title="Your publications" action={<IconLink href="/research" label="Open Research"><FlaskConical /></IconLink>}>
            {home.workingOn.length ? (
              <Rows>{home.workingOn.map((p) => <RowLink key={p.id} href={p.href} title={p.title} detail={p.detail} />)}</Rows>
            ) : (
              <Empty>No publications yet. Add a review or an article in Research when you start one.</Empty>
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
    <div className="mx-auto flex max-w-[1080px] flex-col gap-7">
      <PageHeader
        eyebrow={longToday(tz)}
        title={greeting(tz) + (name ? `, ${name}` : "")}
        subtitle={profile.phdTitle ?? undefined}
        actions={
          <>
            <Button asChild variant="outline"><Link href="/journal">Open Journal</Link></Button>
            <QuickAddButton label="Quick Add" variant="default" />
          </>
        }
      />
      <GuideInvite />
      {backup}
      <Link href="/journal?search=1" data-guide="search" className="flex h-11 items-center gap-2 rounded-xl border-2 bg-card px-3.5 text-muted-foreground md:hidden">
        <Search className="size-4" aria-hidden /> Search everything
      </Link>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-6">
        <NeedsYou home={home} />
        <Section padded guide="home-calendar" title={monthLabel(calendar.month)} action={<IconLink href="/planner?view=calendar" label="Open calendar"><CalendarDays /></IconLink>}>
          <MiniMonth cal={calendar} />
          {home.comingUp.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2 border-t-2 border-zinc-100 pt-3">
              {home.comingUp.slice(0, 3).map((u) => (
                <li key={u.id}>
                  <Link href={u.href} className="flex items-center gap-2.5 rounded-lg py-0.5 text-[14px] hover:underline">
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-sky" />
                    <span className="min-w-0 flex-1 truncate font-display font-bold">{u.title}</span>
                    <span className="shrink-0 text-[13px] text-muted-foreground">{u.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <section data-guide="working-on" className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[22px]">Working on</h2>
          <IconLink href="/research" label="Open Research"><FlaskConical /></IconLink>
        </div>
        {home.workingOn.length ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,290px),1fr))] gap-5">
            {home.workingOn.map((p) => <WorkCard key={p.id} item={p} />)}
          </div>
        ) : (
          <p className="rounded-2xl border-2 border-dashed bg-card px-5 py-6 text-center text-muted-foreground">
            No publications in progress. <Link href="/research" className="font-display font-extrabold text-sky hover:underline">Add one in Research</Link>.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <Section guide="reminders" title="Reminders" className="min-w-0 flex-[3_1_440px]" action={<span className="text-[13px] text-muted-foreground">Tasks, deadlines and events, by date</span>}>
          <Reminders groups={reminders} />
        </Section>
        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-6">
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
            <Link href="/academics" className="mt-3 inline-block font-display text-[13px] font-extrabold text-sky underline-offset-4 hover:underline">Open Academics</Link>
          </Section>
          <Section guide="areas" title="Your areas">
            <Areas areas={areas} />
          </Section>
        </div>
      </div>
    </div>
  );
}
