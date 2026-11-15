import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import {
  BookOpen,
  Building2,
  CheckSquare,
  FileText,
  Flag,
  FlaskConical,
  GraduationCap,
  History,
  Link2,
  MessageSquare,
  Paperclip,
  Sprout,
  Target,
  type LucideIcon,
} from "lucide-react";
import { asUser } from "@/server/auth";
import { getTimeline, getTimelineSummary, isHighlight, TIMELINE_TYPES, type TimelineItem, type TimelineSummary, type TimelineType } from "@/server/timeline";
import { requireProfile } from "@/server/profile";
import { formatDay, formatPartialDate, monthKey, monthNames, shiftMonth, todayIn, type Precision } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/app/app-select";
import { toOptions } from "@/lib/options";
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
  file: "bg-muted text-zinc-700",
};

/** How a month's everyday work is summed up when it's folded away. */
const COUNTED: Record<TimelineType, [string, string, "info" | "success" | "attention" | "grape" | "muted"]> = {
  entry: ["journal entry", "journal entries", "info"],
  experiment: ["experiment update", "experiment updates", "success"],
  task: ["task", "tasks", "muted"],
  manuscript: ["manuscript update", "manuscript updates", "success"],
  feedback: ["feedback note", "feedback notes", "attention"],
  course: ["course update", "course updates", "grape"],
  milestone: ["milestone", "milestones", "grape"],
  enquiry: ["enquiry", "enquiries", "muted"],
  goal: ["goal", "goals", "muted"],
  file: ["file or link", "files and links", "muted"],
};

const PERIODS = { all: "Everything", month: "This month", year: "This year" } as const;
const SHORT_MONTHS = monthNames.map((m) => m.slice(0, 3));

const isOverdue = (it: TimelineItem, today: string) => it.type === "task" && it.event === "due" && Boolean(it.date) && it.date! < today;
const grapeMoment = (it: TimelineItem) => it.type === "milestone" || it.type === "course";

function badgeFor(it: TimelineItem, today: string) {
  if (isOverdue(it, today)) return <Badge variant="overdue">Overdue</Badge>;
  if (it.future) return <Badge variant="outline">{it.type === "task" ? "Due" : "Planned"}</Badge>;
  return null;
}


function monthsBetween(fromKey: string, toKey: string) {
  const [fy, fm] = fromKey.split("-").map(Number);
  const [ty, tm] = toKey.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function durationLabel(months: number) {
  if (months <= 0) return "Started this month";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y} year${y > 1 ? "s" : ""}`, m && `${m} month${m > 1 ? "s" : ""}`].filter(Boolean).join(", ");
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default async function TimelinePage({ searchParams }: PageProps<"/timeline">) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const filters = { type: pick("type"), publication: pick("publication"), period: pick("period"), limit: Number(pick("limit")) || undefined };
  const view: "highlights" | "all" = pick("view") === "highlights" ? "highlights" : "all";

  const { timeline, summary, today, profile } = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    const today = todayIn(profile.timezone);
    return {
      profile,
      timeline: await getTimeline(tx, { ...filters, today, timezone: profile.timezone }),
      summary: await getTimelineSummary(tx, { type: filters.type, publication: filters.publication, today, timezone: profile.timezone }),
      today,
    };
  });
  const filtering = Boolean(timeline.type || timeline.publication || timeline.period !== "all");
  const nothingYet = !filtering && timeline.dated.length === 0 && timeline.undated.length === 0;
  const thisMonth = monthKey(today);

  const params = (extra: Record<string, string | undefined>) =>
    `/timeline?${new URLSearchParams(
      Object.entries({
        type: timeline.type ?? undefined,
        publication: timeline.publication ?? undefined,
        period: timeline.period !== "all" ? timeline.period : undefined,
        view: view === "highlights" ? "highlights" : undefined,
        ...extra,
      }).filter((e): e is [string, string] => Boolean(e[1])),
    ).toString()}`;

  // Month stops, newest first; this month always has a stop so "Today" has a place.
  const groups = new Map<string, TimelineItem[]>();
  for (const it of timeline.dated) {
    const k = monthKey(it.date!);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(it);
  }
  if (view === "all" && timeline.period !== "year" && !groups.has(thisMonth)) groups.set(thisMonth, []);
  let months = [...groups.keys()].sort().reverse();
  if (view === "highlights") months = months.filter((k) => groups.get(k)!.some(isHighlight));
  const years = [...new Set(months.map((k) => k.slice(0, 4)))];

  const start = profile.programmeStart && profile.programmeStartPrecision !== "none" ? { date: profile.programmeStart, precision: profile.programmeStartPrecision } : null;
  const showStart = Boolean(start) && !filtering && !timeline.hasOlder && (months.length === 0 || monthKey(start!.date) <= months[months.length - 1]);

  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-5">
      <PageHeader
        eyebrow="Timeline"
        title="Your PhD so far"
        subtitle="Everything you've recorded, in date order. Big moments stand out; the everyday work stays close by."
        actions={!nothingYet && <TimelineAddButton />}
      />

      {nothingYet && (
        <section data-guide="timeline" className="flex flex-col items-center gap-4 rounded-2xl border-2 bg-card px-8 py-10 text-center shadow-edge">
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

      {!nothingYet && summary.total > 0 && <SummaryCard summary={summary} start={start} thisMonth={thisMonth} filtering={Boolean(timeline.type || timeline.publication)} />}

      {!nothingYet && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <nav aria-label="Show" className="inline-flex gap-1 rounded-2xl bg-muted p-1">
            {(["highlights", "all"] as const).map((v) => (
              <Link
                key={v}
                href={params({ view: v === "highlights" ? "highlights" : undefined, limit: undefined })}
                aria-current={view === v ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center rounded-xl px-4 font-display text-sm font-extrabold transition-colors",
                  view === v ? "bg-card text-foreground shadow-[0_2px_0_var(--border)]" : "text-zinc-600 hover:text-foreground",
                )}
              >
                {v === "highlights" ? "Highlights" : "Everything"}
              </Link>
            ))}
          </nav>
          <form className="flex flex-wrap items-end gap-2" data-guide="timeline-filters">
            {view === "highlights" && <input type="hidden" name="view" value="highlights" />}
            <AppSelect name="type" defaultValue={timeline.type ?? ""} aria-label="Type" size="sm" className="w-auto" options={toOptions(TIMELINE_TYPES, "Everything")} />
            {timeline.publication && <input type="hidden" name="publication" value={timeline.publication} />}
            <AppSelect name="period" defaultValue={timeline.period} aria-label="Period" size="sm" className="w-auto" options={toOptions(PERIODS)} />
            <Button type="submit" size="sm">Apply</Button>
            {filtering && <Button asChild size="sm" variant="ghost"><Link href={view === "highlights" ? "/timeline?view=highlights" : "/timeline"}>Clear</Link></Button>}
          </form>
        </div>
      )}

      {!nothingYet && months.length === 0 && (
        <p data-guide="timeline" className="rounded-2xl border-2 bg-card px-5 py-8 text-center text-muted-foreground shadow-edge">
          {view === "highlights"
            ? "No big moments here yet. They appear when you reach a milestone, submit a paper, finish a course or complete a review step."
            : "Nothing matches. Try another type or period."}
        </p>
      )}

      {months.length > 0 && (
        <div className="flex items-start gap-6">
          <ol data-guide="timeline" aria-label="Timeline, newest first" className="min-w-0 flex-1">
            {months.map((k, i) => (
              <MonthStop
                key={k}
                month={k}
                items={groups.get(k)!}
                today={today}
                view={view}
                firstOfYear={i === 0 || months[i - 1].slice(0, 4) !== k.slice(0, 4)}
                last={i === months.length - 1 && !showStart}
              />
            ))}
            {showStart && <StartStop date={start!.date} precision={start!.precision} />}
          </ol>
          {years.length > 1 && (
            <nav aria-label="Jump to year" className="sticky top-6 hidden w-28 shrink-0 flex-col gap-1.5 rounded-2xl border-2 bg-card p-2 lg:flex">
              <span className="py-1 text-center font-display text-[11px] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">Jump to</span>
              {years.map((y) => (
                <a key={y} href={`#y-${y}`} className="flex h-10 items-center justify-center rounded-xl font-display text-[15px] font-black text-zinc-700 transition-colors hover:bg-zinc-100">
                  {y}
                </a>
              ))}
            </nav>
          )}
        </div>
      )}

      {timeline.hasOlder && (
        <Link href={params({ limit: String(timeline.limit + 150) })} scroll={false} className="self-center rounded-xl border-2 bg-card px-4 py-2 font-display text-sm font-extrabold shadow-edge transition-transform duration-75 hover:bg-zinc-50 active:translate-y-1 active:shadow-none">
          Show older
        </Link>
      )}

      {timeline.undated.length > 0 && view === "all" && (
        <section id="no-date" data-guide="timeline-undated" className="scroll-mt-6 rounded-2xl border-2 border-dashed bg-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-2">
            <h2 className="text-lg">No date yet</h2>
            <span className="text-[13px] text-muted-foreground">{timeline.undated.length} · they join the path once they have a day or a month</span>
          </div>
          <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
            {timeline.undated.map((it) => <UndatedItem key={it.key} it={it} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

function SummaryCard({ summary, start, thisMonth, filtering }: { summary: TimelineSummary; start: { date: string; precision: Precision } | null; thisMonth: string; filtering: boolean }) {
  const keys = Array.from({ length: 12 }, (_, i) => shiftMonth(thisMonth, i - 11));
  const counts = keys.map((k) => summary.byMonth.get(k) ?? 0);
  const max = Math.max(...counts, 1);
  const spoken = keys.map((k, i) => `${SHORT_MONTHS[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}: ${counts[i]}`).join(", ");
  return (
    <section aria-label="Summary" className="flex flex-wrap items-center gap-x-10 gap-y-5 rounded-2xl border-2 bg-card px-6 py-5 shadow-edge">
      <div className="flex flex-col gap-0.5">
        <span className="font-display text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
          {filtering ? "Matching records" : start ? `Since ${formatPartialDate(start.date, start.precision, { short: true })}` : "Recorded so far"}
        </span>
        <span className="font-display text-[22px] font-black">
          {!filtering && start ? durationLabel(monthsBetween(monthKey(start.date), thisMonth)) : plural(summary.total, "record", "records")}
        </span>
      </div>
      <dl className="flex flex-wrap gap-x-7 gap-y-3">
        <Stat value={summary.total} label={summary.total === 1 ? "thing recorded" : "things recorded"} />
        <Stat value={summary.highlights} label={summary.highlights === 1 ? "big moment" : "big moments"} className="text-grape-strong" />
        <Stat value={summary.activeMonths} label={summary.activeMonths === 1 ? "month with records" : "months with records"} className="text-leaf-strong" />
      </dl>
      <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-1.5">
        <div role="img" aria-label={`Records per month, last 12 months: ${spoken}`} className="flex h-12 items-end gap-[3px]">
          {counts.map((n, i) => (
            <span
              key={keys[i]}
              className={cn("flex-1 rounded-t-[5px] rounded-b-[2px]", i === 11 ? "bg-primary" : n ? "bg-leaf-bright/45" : "bg-zinc-100")}
              style={{ height: `${n ? Math.max((n / max) * 100, 12) : 6}%` }}
            />
          ))}
        </div>
        <div className="flex justify-between text-[12px] text-muted-foreground" aria-hidden>
          <span>{SHORT_MONTHS[Number(keys[0].slice(5)) - 1]}</span>
          <span>Records per month · quiet months are fine</span>
          <span>{SHORT_MONTHS[Number(thisMonth.slice(5)) - 1]}</span>
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <div className="flex flex-col">
      <dt className="order-last text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn("font-display text-[26px] leading-tight font-black tabular-nums", className)}>{value}</dd>
    </div>
  );
}

/** One stop on the path: the month on the left, the rail, then what happened. */
function Stop({ id, label, sub, dot, dashed, last, children, ariaLabel }: { id?: string; label: ReactNode; sub?: ReactNode; dot: ReactNode; dashed?: boolean; last?: boolean; children: ReactNode; ariaLabel?: string }) {
  return (
    <li id={id} aria-label={ariaLabel} className="grid scroll-mt-6 grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[6.5rem_2.5rem_minmax(0,1fr)] sm:gap-x-4">
      <div className="col-start-2 row-start-1 flex flex-wrap items-baseline gap-x-2 pt-1.5 sm:col-start-1 sm:flex-col sm:items-end sm:text-right">
        <h2 className="text-xl leading-tight">{label}</h2>
        {sub && <span className="text-[13px] text-muted-foreground">{sub}</span>}
      </div>
      <div aria-hidden className="col-start-1 row-span-2 row-start-1 flex flex-col items-center sm:col-start-2">
        {dot}
        {!last && (dashed ? <span className="mt-1 w-0 flex-1 border-l-[3px] border-dashed border-zinc-300" /> : <span className="mt-1 w-1.5 flex-1 rounded-full bg-zinc-200" />)}
      </div>
      <div className="col-start-2 row-start-2 flex min-w-0 flex-col gap-1 pt-2 pb-9 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:pt-0">{children}</div>
    </li>
  );
}

function MonthStop({ month, items, today, view, firstOfYear, last }: { month: string; items: TimelineItem[]; today: string; view: "highlights" | "all"; firstOfYear: boolean; last: boolean }) {
  const thisMonth = monthKey(today);
  const current = month === thisMonth;
  const future = month > thisMonth;
  const year = month.slice(0, 4);
  const moments = items.filter(isHighlight);
  const everyday = items.filter((it) => !isHighlight(it));
  const recorded = items.filter((it) => !it.future).length;
  const sub = view === "highlights" ? `${year} · ${plural(moments.length, "big moment", "big moments")}` : `${year} · ${future ? `${items.length} planned` : current ? `${recorded} so far` : plural(items.length, "record", "records")}`;

  const dot = current ? (
    <span className="mt-2 size-6 rounded-full border-[5px] border-primary bg-card" />
  ) : future ? (
    <span className="mt-2 size-6 rounded-full border-[3px] border-dashed border-zinc-400 bg-card" />
  ) : moments.length ? (
    <span className="mt-2 size-6 rounded-full border-[5px] border-grape bg-card" />
  ) : (
    <span className="mt-2 size-6 rounded-full border-[5px] border-zinc-300 bg-card" />
  );

  let body: ReactNode;
  if (view === "highlights") {
    body = moments.map((it) => <MomentCard key={it.key} it={it} />);
  } else if (current || future) {
    // Everything in order, with a "Today" line where the planned part ends.
    const rows: ReactNode[] = [];
    let placed = !current;
    for (const it of items) {
      if (!placed && !it.future) {
        rows.push(<TodayLine key="today" today={today} />);
        placed = true;
      }
      rows.push(isHighlight(it) ? <MomentCard key={it.key} it={it} /> : <ItemRow key={it.key} it={it} today={today} />);
    }
    if (!placed) rows.push(<TodayLine key="today" today={today} />);
    if (current && items.length === 0) rows.push(<p key="quiet" className="px-3 py-2 text-[14px] text-muted-foreground">Nothing recorded yet this month.</p>);
    body = rows;
  } else {
    body = (
      <>
        {moments.map((it) => <MomentCard key={it.key} it={it} />)}
        {everyday.length > 0 && everyday.length <= 4 && everyday.map((it) => <ItemRow key={it.key} it={it} today={today} />)}
        {everyday.length > 4 && <Folded items={everyday} today={today} />}
      </>
    );
  }

  return (
    <Stop
      id={firstOfYear ? `y-${year}` : undefined}
      label={SHORT_MONTHS[Number(month.slice(5)) - 1]}
      sub={current && view === "all" ? <span className="font-semibold text-leaf-strong">{sub} · this month</span> : sub}
      dot={dot}
      dashed={future}
      last={last}
    >
      {body}
    </Stop>
  );
}

/** An older month's everyday work, summed up as pills; the full list opens in place. */
function Folded({ items, today }: { items: TimelineItem[]; today: string }) {
  const counts = new Map<TimelineType, number>();
  for (const it of items) counts.set(it.type, (counts.get(it.type) ?? 0) + 1);
  return (
    <details className="group/fold">
      <summary className="flex cursor-pointer list-none flex-col gap-2 rounded-xl px-3 py-2 outline-none hover:bg-card focus-visible:ring-4 focus-visible:ring-sky-soft [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap gap-2">
          {[...counts].map(([t, n]) => (
            <Badge key={t} variant={COUNTED[t][2]}>{plural(n, COUNTED[t][0], COUNTED[t][1])}</Badge>
          ))}
        </span>
        <span className="font-display text-[13px] font-extrabold text-sky group-open/fold:hidden">Show all {items.length}</span>
        <span className="hidden font-display text-[13px] font-extrabold text-sky group-open/fold:inline">Hide</span>
      </summary>
      <div className="flex flex-col gap-1 pt-1">
        {items.map((it) => <ItemRow key={it.key} it={it} today={today} />)}
      </div>
    </details>
  );
}

function TodayLine({ today }: { today: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1.5" aria-label={`Today, ${formatDay(today)}`}>
      <span className="font-display text-xs font-black tracking-[0.06em] text-leaf-strong uppercase">Today · {formatDay(today)}</span>
      <span aria-hidden className="h-0.5 flex-1 rounded-full bg-leaf-soft" />
    </div>
  );
}

function When({ it }: { it: TimelineItem }) {
  return it.precision === "day" && it.date ? (
    <span className="text-[13px] whitespace-nowrap text-zinc-600 tabular-nums">{formatDay(it.date)}</span>
  ) : (
    <span className="text-[12px] whitespace-nowrap text-muted-foreground">Day not known</span>
  );
}

function ItemRow({ it, today }: { it: TimelineItem; today: string }) {
  const Icon = it.type === "file" && it.event === "link" ? Link2 : ICONS[it.type];
  const overdue = isOverdue(it, today);
  const badge = badgeFor(it, today);
  return (
    <div className="relative flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-card">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[10px]",
          overdue ? "bg-overdue text-overdue-foreground" : it.future ? "border-2 border-dashed border-zinc-300 bg-card text-zinc-500" : TONES[it.type],
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <Link href={it.href} className="block font-display text-[15px] leading-snug font-bold after:absolute after:inset-0">
          {it.title}
        </Link>
        <span className="block text-[13px] text-muted-foreground">{[it.label, it.detail].filter(Boolean).join(" · ")}</span>
        {it.attachments.length > 0 && <TimelineFiles items={it.attachments} />}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 pt-0.5">
        <When it={it} />
        {badge}
      </div>
    </div>
  );
}

/** A big moment: a milestone, a submission or decision, a course finished or recognised, a review step done. */
function MomentCard({ it }: { it: TimelineItem }) {
  const Icon = it.type === "file" && it.event === "link" ? Link2 : ICONS[it.type];
  const grape = grapeMoment(it);
  return (
    <div
      className={cn(
        "relative my-1.5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border-2 bg-card px-4 py-3.5 transition-colors hover:bg-zinc-50",
        grape ? "border-grape-light shadow-[0_4px_0_var(--grape-light)]" : "border-leaf-soft shadow-[0_4px_0_var(--leaf-soft)]",
        it.future && "border-dashed",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-12 shrink-0 items-center justify-center rounded-2xl text-white [&_svg]:size-6",
          grape ? "bg-grape shadow-[0_3px_0_var(--grape-strong)]" : "bg-primary shadow-[0_3px_0_var(--primary-edge)]",
        )}
      >
        <Icon strokeWidth={2.4} />
      </span>
      <div className="min-w-0 flex-[1_1_160px]">
        <Link href={it.href} className="block font-display text-[17px] leading-snug font-black after:absolute after:inset-0">
          {it.title}
        </Link>
        <span className="block text-[13px] text-muted-foreground">{it.detail || " "}</span>
        {it.attachments.length > 0 && <TimelineFiles items={it.attachments} />}
      </div>
      <div className="flex shrink-0 items-center gap-2 max-sm:basis-full max-sm:pl-16 sm:flex-col sm:items-end sm:gap-1.5">
        <Badge variant={grape ? "grape" : "success"}>{it.future ? `Planned · ${it.label}` : it.label}</Badge>
        <When it={it} />
      </div>
    </div>
  );
}

function StartStop({ date, precision }: { date: string; precision: Precision }) {
  return (
    <Stop
      ariaLabel="PhD started"
      label={SHORT_MONTHS[Number(monthKey(date).slice(5)) - 1]}
      sub={date.slice(0, 4)}
      last
      dot={
        <span className="mt-1 flex size-10 items-center justify-center rounded-full bg-leaf-soft text-primary">
          <Sprout className="size-5" strokeWidth={2.4} />
        </span>
      }
    >
      <div className="px-3 pt-1.5">
        <p className="font-display text-lg font-black">PhD started</p>
        <p className="text-[13px] text-muted-foreground">{formatPartialDate(date, precision)} · where the path begins</p>
      </div>
    </Stop>
  );
}

function UndatedItem({ it }: { it: TimelineItem }) {
  const Icon = it.type === "file" && it.event === "link" ? Link2 : ICONS[it.type];
  return (
    <li className="relative flex min-h-14 items-start gap-3 px-5 py-3 transition-colors hover:bg-zinc-50">
      <span aria-hidden className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[10px]", TONES[it.type])}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <Link href={it.href} className="block font-display text-[15px] font-bold after:absolute after:inset-0">
          {it.title}
        </Link>
        <span className="block text-[13px] text-muted-foreground">{[it.label, it.detail].filter(Boolean).join(" · ")}</span>
        {it.attachments.length > 0 && <TimelineFiles items={it.attachments} />}
      </span>
    </li>
  );
}
