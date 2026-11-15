import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
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
import { AppSelect } from "@/components/app/app-select";
import { toOptions, rowOptions } from "@/lib/options";
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

/** Each kind of record keeps its area's colour (Leaf research, Sky journal, Sun feedback, Grape academics). */
const TONES: Record<TimelineType, string> = {
  entry: "bg-sky-soft text-sky",
  experiment: "bg-leaf-soft text-primary",
  task: "bg-muted text-zinc-700",
  manuscript: "bg-leaf-soft text-primary",
  feedback: "bg-attention text-sun-strong",
  course: "bg-grape-soft text-grape",
  milestone: "bg-grape-soft text-grape",
  enquiry: "bg-muted text-zinc-700",
  goal: "bg-muted text-zinc-700",
  project: "bg-leaf-soft text-primary",
  file: "bg-muted text-zinc-700",
};

const PERIODS = { all: "Everything", month: "This month", year: "This year" } as const;

const isOverdue = (it: TimelineItem, today: string) => it.type === "task" && it.event === "due" && Boolean(it.date) && it.date! < today;

function badgeFor(it: TimelineItem, today: string) {
  if (isOverdue(it, today)) return <Badge variant="attention">Overdue</Badge>;
  if (it.future) return <Badge variant="outline">{it.type === "task" ? "Due" : "Planned"}</Badge>;
  return null;
}

/**
 * The line is drawn row by row: each row has an upper and a lower half that meet
 * at the row's dot (18px from the top), so it stays continuous whatever a row's height.
 * Above "Today" the line is dashed (planned), below it solid.
 */
type Row =
  | { kind: "month"; key: string; month: string }
  | { kind: "day-unknown"; key: string }
  | { kind: "today"; key: string }
  | { kind: "item"; key: string; it: TimelineItem; showDate: boolean };

const DOT_CENTER = "h-[18px]";

function Line({ first, last, upperDashed, lowerDashed }: { first: boolean; last: boolean; upperDashed: boolean; lowerDashed: boolean }) {
  const seg = (dashed: boolean) => cn("absolute left-1/2 -translate-x-1/2 border-l-2", dashed ? "border-dashed border-zinc-300" : "border-zinc-300");
  return (
    <>
      {!first && <span aria-hidden className={cn(seg(upperDashed), "top-0", DOT_CENTER)} />}
      {!last && <span aria-hidden className={cn(seg(lowerDashed), "top-[18px] bottom-0")} />}
    </>
  );
}

const GRID = "grid grid-cols-[2.75rem_1.75rem_minmax(0,1fr)] gap-x-2.5 sm:grid-cols-[3.5rem_1.75rem_minmax(0,1fr)] sm:gap-x-3";
const DATE = "pt-2 text-right text-[13px] leading-5 text-zinc-600 tabular-nums";

function TimelineRow({ row, first, last, planned, today }: { row: Row; first: boolean; last: boolean; planned: boolean; today: string }) {
  const line = (
    <Line
      first={first}
      last={last}
      upperDashed={planned || row.kind === "today"}
      lowerDashed={planned && row.kind !== "today"}
    />
  );

  if (row.kind === "month") {
    const future = row.month > monthKey(today);
    return (
      <li className={GRID}>
        <span />
        <span className="relative flex justify-center">
          {line}
          <span aria-hidden className="relative mt-[13px] size-2.5 rounded-full bg-zinc-400 ring-4 ring-card" />
        </span>
        <div className="flex flex-wrap items-center gap-2 pt-1.5 pb-3">
          <h2 className="text-[15px] leading-6 font-extrabold">{monthLabel(row.month)}</h2>
          {future && <Badge variant="outline">Planned</Badge>}
          {row.month === monthKey(today) && <span className="text-[13px] text-muted-foreground">This month</span>}
        </div>
      </li>
    );
  }

  if (row.kind === "day-unknown") {
    return (
      <li className={GRID}>
        <span />
        <span className="relative flex justify-center">{line}</span>
        <p className="pt-1 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Day not known</p>
      </li>
    );
  }

  if (row.kind === "today") {
    return (
      <li className={GRID} aria-label={`Today, ${formatDay(today)}`}>
        <span className={cn(DATE, "font-semibold text-foreground")}>{formatDay(today)}</span>
        <span className="relative flex justify-center">
          {line}
          <span aria-hidden className="relative mt-2.5 size-4 rounded-full bg-primary shadow-[0_2px_0_var(--primary-edge)] ring-4 ring-card" />
        </span>
        <div className="flex items-center gap-3 pt-2 pb-4">
          <span className="font-display text-[13px] leading-5 font-black text-leaf-strong">Today</span>
          <span aria-hidden className="h-0.5 flex-1 rounded-full bg-leaf-soft" />
        </div>
      </li>
    );
  }

  const { it } = row;
  const Icon = it.type === "file" && it.event === "link" ? Link2 : ICONS[it.type];
  const overdue = isOverdue(it, today);
  return (
    <li className={GRID}>
      <span className={DATE}>{row.showDate && it.precision === "day" && it.date ? formatDay(it.date) : ""}</span>
      <span className="relative flex justify-center">
        {line}
        <span
          aria-hidden
          className={cn(
            "relative mt-0.5 flex size-8 items-center justify-center rounded-[10px] ring-4 ring-card",
            overdue
              ? "bg-overdue text-overdue-foreground"
              : it.future
                ? "border-2 border-dashed border-zinc-300 bg-card text-zinc-500"
                : TONES[it.type],
          )}
        >
          <Icon className="size-3.5" />
        </span>
      </span>
      <div className="pb-4">
        <div className="relative -mx-2 flex items-start gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-zinc-50">
          <div className="min-w-0 flex-1">
            <span className="block text-[12px] leading-5 text-muted-foreground">{it.label}</span>
            <Link href={it.href} className="block font-display text-[15px] font-bold after:absolute after:inset-0">
              {it.title}
            </Link>
            {it.detail && <span className="block text-[13px] text-muted-foreground">{it.detail}</span>}
            {it.attachments.length > 0 && <TimelineFiles items={it.attachments} />}
          </div>
          {badgeFor(it, today) && <span className="shrink-0 pt-0.5">{badgeFor(it, today)}</span>}
        </div>
      </div>
    </li>
  );
}

/** Month markers, items (exact days first, then "Day not known") and the Today point, in display order. */
function buildRows(items: TimelineItem[], today: string): Row[] {
  const groups = new Map<string, { exact: TimelineItem[]; month: TimelineItem[] }>();
  for (const it of items) {
    const k = monthKey(it.date!);
    if (!groups.has(k)) groups.set(k, { exact: [], month: [] });
    groups.get(k)![it.precision === "day" ? "exact" : "month"].push(it);
  }
  const rows: Row[] = [];
  let todayPlaced = items.length === 0;
  let lastDate: string | null = null; // each day's date is written once, next to its first item
  const placeToday = () => {
    if (!todayPlaced) {
      rows.push({ kind: "today", key: "today" });
      lastDate = today;
    }
    todayPlaced = true;
  };
  const pushItem = (it: TimelineItem) => {
    const day = it.precision === "day" ? it.date : null;
    rows.push({ kind: "item", key: it.key, it, showDate: day !== lastDate });
    lastDate = day;
  };
  for (const [k, g] of groups) {
    // Today falls before this month's past items — or before the whole month if it's an earlier month
    if (k < monthKey(today)) placeToday();
    rows.push({ kind: "month", key: `m:${k}`, month: k });
    for (const it of g.exact) {
      if (!it.future) placeToday();
      pushItem(it);
    }
    if (g.month.length) {
      if (g.month.some((it) => !it.future)) placeToday();
      rows.push({ kind: "day-unknown", key: `u:${k}` });
      for (const it of g.month) pushItem(it);
    }
  }
  placeToday();
  return rows;
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
  const nothingYet = !filtering && timeline.dated.length === 0 && timeline.undated.length === 0;
  const rows = buildRows(timeline.dated, today);
  const todayAt = rows.findIndex((r) => r.kind === "today");

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
          <AppSelect name="type" defaultValue={timeline.type ?? ""} aria-label="Type" size="sm" className="w-auto" options={toOptions(TIMELINE_TYPES, "Everything")} />
          <AppSelect name="project" defaultValue={timeline.project ?? ""} aria-label="Project" size="sm" className="w-auto max-w-56" options={rowOptions(projects, (p) => p.title.split(":")[0], "All projects")} />
          <AppSelect name="period" defaultValue={timeline.period} aria-label="Period" size="sm" className="w-auto" options={toOptions(PERIODS)} />
          <Button type="submit" size="sm">Apply</Button>
          {filtering && <Button asChild size="sm" variant="ghost"><Link href="/timeline">Clear</Link></Button>}
        </form>
      )}

      {nothingYet && (
        <section data-guide="timeline" className="flex flex-col items-center gap-4 rounded-2xl border-2 bg-card shadow-edge px-8 py-10 text-center">
          <div aria-hidden className="flex size-14 items-center justify-center rounded-2xl bg-leaf-soft">
            <History className="size-7 text-primary" />
          </div>
          <div className="flex max-w-[460px] flex-col gap-1.5">
            <h2 className="text-lg font-extrabold">Your timeline starts here</h2>
            <p className="text-muted-foreground">
              Everything you record — entries, experiments, tasks, papers, courses and files — appears here in date order. Add the first thing that happened.
            </p>
          </div>
          <TimelineAddButton />
        </section>
      )}

      {!nothingYet && timeline.dated.length === 0 && timeline.undated.length === 0 && (
        <p data-guide="timeline" className="rounded-2xl border-2 bg-card shadow-edge px-5 py-8 text-center text-muted-foreground">
          Nothing matches. Try another type, project or period.
        </p>
      )}

      {timeline.dated.length > 0 && (
        <section data-guide="timeline" aria-label="Timeline" className="rounded-2xl border-2 bg-card shadow-edge px-3 pt-4 pb-1 sm:px-5">
          <ol>
            {rows.map((row, i) => (
              <TimelineRow key={row.key} row={row} first={i === 0} last={i === rows.length - 1} planned={i < todayAt} today={today} />
            ))}
          </ol>
        </section>
      )}

      {timeline.hasOlder && (
        <Link href={olderHref} scroll={false} className="self-center rounded-xl border-2 bg-card px-4 py-2 font-display text-sm font-extrabold shadow-edge transition-transform duration-75 hover:bg-zinc-50 active:translate-y-1 active:shadow-none">
          Show older
        </Link>
      )}

      {timeline.undated.length > 0 && (
        <section id="no-date" data-guide="timeline-undated" className="scroll-mt-6 rounded-2xl border-2 bg-card shadow-edge">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-2">
            <h2 className="text-[15px] font-extrabold">No date yet</h2>
            <span className="text-[13px] text-muted-foreground">{timeline.undated.length} · not on the timeline until they have a day or a month</span>
          </div>
          <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
            {timeline.undated.map((it) => <UndatedItem key={it.key} it={it} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

function UndatedItem({ it }: { it: TimelineItem }) {
  const Icon = it.type === "file" && it.event === "link" ? Link2 : ICONS[it.type];
  return (
    <li className="relative flex min-h-14 items-start gap-3 px-5 py-3 transition-colors hover:bg-zinc-50">
      <span aria-hidden className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[10px]", TONES[it.type])}>
        <Icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] leading-5 text-muted-foreground">{it.label}</span>
        <Link href={it.href} className="block font-medium after:absolute after:inset-0">
          {it.title}
        </Link>
        {it.detail && <span className="block text-[13px] text-muted-foreground">{it.detail}</span>}
        {it.attachments.length > 0 && <TimelineFiles items={it.attachments} />}
      </span>
    </li>
  );
}
