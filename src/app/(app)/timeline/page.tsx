import type { Metadata } from "next";
import Link from "next/link";
import {
  BookOpen,
  Building2,
  CheckSquare,
  FileText,
  Flag,
  FlaskConical,
  FolderOpen,
  GraduationCap,
  History,
  Link2,
  MessageSquare,
  Paperclip,
  Target,
  type LucideIcon,
} from "lucide-react";
import { asUser } from "@/server/auth";
import { getTimeline, TIMELINE_TYPES, type TimelineItem, type TimelineType } from "@/server/timeline";
import { projectOptions, requireProfile } from "@/server/profile";
import { formatDay, monthKey, monthLabel, todayIn } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/app/ui";
import { TimelineAddButton, TimelineFiles } from "./timeline-client";

export const metadata: Metadata = { title: "Timeline" };

const ICONS: Record<TimelineType, LucideIcon> = {
  entry: BookOpen,
  experiment: FlaskConical,
  task: CheckSquare,
  manuscript: FileText,
  feedback: MessageSquare,
  course: GraduationCap,
  milestone: Flag,
  enquiry: Building2,
  goal: Target,
  project: FolderOpen,
  file: Paperclip,
};

const PERIODS = { all: "Everything", month: "This month", year: "This year" } as const;

function badgeFor(it: TimelineItem, today: string) {
  if (it.type === "task" && it.event === "due" && it.date && it.date < today) return <Badge variant="attention">Overdue</Badge>;
  if (it.future) return <Badge variant="outline">{it.type === "task" ? "Due" : "Planned"}</Badge>;
  return null;
}

function Item({ it, today, dated = true }: { it: TimelineItem; today: string; dated?: boolean }) {
  const Icon = it.type === "file" && it.event === "link" ? Link2 : ICONS[it.type];
  return (
    <li className="relative flex min-h-14 items-start gap-4 px-5 py-3 transition-colors hover:bg-zinc-50">
      {dated && (
        <span className="w-14 shrink-0 pt-[19px] text-[13px] leading-5 text-zinc-600 tabular-nums">
          {it.precision === "day" && it.date ? formatDay(it.date) : "—"}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[12px] leading-5 text-muted-foreground">
          <Icon className="size-3.5 shrink-0" aria-hidden /> {it.label}
        </span>
        <Link href={it.href} className="block font-medium after:absolute after:inset-0">
          {it.title}
        </Link>
        {it.detail && <span className="block text-[13px] text-muted-foreground">{it.detail}</span>}
        {it.attachments.length > 0 && <TimelineFiles items={it.attachments} />}
      </span>
      <span className="shrink-0 pt-[18px]">{badgeFor(it, today)}</span>
    </li>
  );
}

export default async function TimelinePage({ searchParams }: PageProps<"/timeline">) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const filters = { type: pick("type"), project: pick("project"), period: pick("period"), limit: Number(pick("limit")) || undefined };

  const { timeline, projects, today } = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    const today = todayIn(profile.timezone);
    return {
      timeline: await getTimeline(tx, { ...filters, today, timezone: profile.timezone }),
      projects: await projectOptions(tx),
      today,
    };
  });
  const filtering = Boolean(timeline.type || timeline.project || timeline.period !== "all");

  // group by month; within a month exact days first, then "Day not known"
  const groups = new Map<string, { exact: TimelineItem[]; month: TimelineItem[] }>();
  for (const it of timeline.dated) {
    const k = monthKey(it.date!);
    if (!groups.has(k)) groups.set(k, { exact: [], month: [] });
    groups.get(k)![it.precision === "day" ? "exact" : "month"].push(it);
  }
  const thisMonth = monthKey(today);
  const nothingYet = !filtering && groups.size === 0 && timeline.undated.length === 0;

  const olderHref = `/timeline?${new URLSearchParams({
    ...(timeline.type ? { type: timeline.type } : {}),
    ...(timeline.project ? { project: timeline.project } : {}),
    ...(timeline.period !== "all" ? { period: timeline.period } : {}),
    limit: String(timeline.limit + 150),
  }).toString()}`;

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5">
      <PageHeader title="Timeline" subtitle="The whole story so far — everything you've recorded, in date order." actions={!nothingYet && <TimelineAddButton />} />

      {!nothingYet && (
        <form className="flex flex-wrap items-end gap-2" data-guide="timeline-filters">
          <NativeSelect name="type" defaultValue={timeline.type ?? ""} aria-label="Type" className="h-9 w-auto">
            <option value="">Everything</option>
            {Object.entries(TIMELINE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
          <NativeSelect name="project" defaultValue={timeline.project ?? ""} aria-label="Project" className="h-9 w-auto max-w-56">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title.split(":")[0]}</option>)}
          </NativeSelect>
          <NativeSelect name="period" defaultValue={timeline.period} aria-label="Period" className="h-9 w-auto">
            {Object.entries(PERIODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
          <Button type="submit" size="sm">Apply</Button>
          {filtering && <Button asChild size="sm" variant="ghost"><Link href="/timeline">Clear</Link></Button>}
        </form>
      )}

      {nothingYet && (
        <section data-guide="timeline" className="flex flex-col items-center gap-4 rounded-xl border bg-card px-8 py-10 text-center">
          <div aria-hidden className="flex size-11 items-center justify-center rounded-full bg-muted">
            <History className="size-5 text-zinc-700" />
          </div>
          <div className="flex max-w-[460px] flex-col gap-1.5">
            <h2 className="text-lg font-semibold">Your timeline starts here</h2>
            <p className="text-muted-foreground">
              Everything you record — entries, experiments, tasks, papers, courses and files — appears here in date order. Add the first thing that happened.
            </p>
          </div>
          <TimelineAddButton />
        </section>
      )}

      {!nothingYet && groups.size === 0 && timeline.undated.length === 0 && (
        <p data-guide="timeline" className="rounded-xl border bg-card px-5 py-8 text-center text-muted-foreground">
          Nothing matches. Try another type, project or period.
        </p>
      )}

      {[...groups.entries()].map(([k, g]) => (
        <section key={k} data-guide="timeline" className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-[15px] font-semibold">{monthLabel(k)}</h2>
            {k > thisMonth && <Badge variant="outline">Planned</Badge>}
            {k === thisMonth && <span className="text-[13px] text-muted-foreground">This month</span>}
          </div>
          {g.exact.length > 0 && (
            <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
              {g.exact.map((it) => <Item key={it.key} it={it} today={today} />)}
            </ul>
          )}
          {g.month.length > 0 && (
            <>
              <p className="px-5 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Day not known</p>
              <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
                {g.month.map((it) => <Item key={it.key} it={it} today={today} />)}
              </ul>
            </>
          )}
        </section>
      ))}

      {timeline.hasOlder && (
        <Link href={olderHref} scroll={false} className="self-center rounded-lg border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">
          Show older
        </Link>
      )}

      {timeline.undated.length > 0 && (
        <section id="no-date" data-guide="timeline-undated" className="scroll-mt-6 rounded-xl border bg-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-2">
            <h2 className="text-[15px] font-semibold">No date yet</h2>
            <span className="text-[13px] text-muted-foreground">{timeline.undated.length} · kept here until they have a day or a month</span>
          </div>
          <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
            {timeline.undated.map((it) => <Item key={it.key} it={it} today={today} dated={false} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
