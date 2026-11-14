import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { monthLabel } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { TaskCheckbox } from "@/components/app/task-checkbox";
import { PriorityMark } from "@/components/app/priority";
import type { Area, HomeCalendar, Reminder, ReminderGroups } from "@/server/home";

const GROUPS: { key: keyof ReminderGroups; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "week", label: "Next 7 days" },
  { key: "later", label: "Later" },
  { key: "undated", label: "No date yet" },
];

function ReminderRow({ r }: { r: Reminder }) {
  const body = (
    <span className="min-w-0 flex-1">
      <span className="block font-medium">
        {r.title}
        <PriorityMark priority={r.priority} className="ml-2 align-[1px]" />
      </span>
      {r.detail && <span className={cn("block text-[13px]", r.overdue ? "text-overdue-foreground" : "text-muted-foreground")}>{r.detail}</span>}
    </span>
  );
  return (
    <li className="flex min-h-12 items-center gap-3 px-5 py-2.5">
      {r.taskId ? (
        <TaskCheckbox id={r.taskId} title={r.title} done={false} />
      ) : (
        <CalendarDays className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
      )}
      {r.taskId ? body : <Link href={r.href} className="min-w-0 flex-1 hover:underline">{body}</Link>}
      {r.overdue && <Badge variant="overdue">Overdue</Badge>}
      {r.waiting && <Badge variant="attention">Waiting</Badge>}
    </li>
  );
}

/** Every open task, deadline and coming event, by when. Each group shows its first few. */
export function Reminders({ groups, perGroup = 6 }: { groups: ReminderGroups; perGroup?: number }) {
  const any = GROUPS.some((g) => groups[g.key].length > 0);
  if (!any) return <p className="px-5 pb-5 text-sm text-muted-foreground">Nothing to do. Use Quick Add to plan your next step.</p>;
  return (
    <div className="border-t border-zinc-100">
      {GROUPS.filter((g) => groups[g.key].length > 0).map((g) => {
        const items = groups[g.key];
        return (
          <div key={g.key} className="border-b border-zinc-100 last:border-b-0">
            <p className={cn("px-5 pt-3 pb-1 text-[12px] font-semibold tracking-wide uppercase", g.key === "overdue" ? "text-overdue-foreground" : "text-muted-foreground")}>
              {g.label} · {items.length}
            </p>
            <ul>{items.slice(0, perGroup).map((r) => <ReminderRow key={r.key} r={r} />)}</ul>
            {items.length > perGroup && (
              <Link href="/planner" className="block px-5 pb-3 text-[13px] text-muted-foreground underline-offset-4 hover:underline">
                {items.length - perGroup} more — open Planner
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

type Day = { key: string; n: number; name?: string; isToday: boolean; isLate: boolean; has: boolean; dim?: boolean; href: string; spoken: string };

/** One day: a link when something is on it (to the calendar), plain text otherwise. */
function DayCell({ d, tall }: { d: Day; tall?: boolean }) {
  const cls = cn(
    "relative flex justify-center rounded-md text-[12px] tabular-nums",
    tall ? "h-14 flex-col items-center pt-1.5" : "h-9 pt-1",
    d.isToday ? "bg-primary font-semibold text-primary-foreground" : d.isLate ? "border border-overdue-border bg-overdue font-semibold text-overdue-foreground" : "bg-zinc-50 text-zinc-700",
    d.dim && !d.isToday && "text-muted-foreground",
  );
  const body = (
    <>
      {d.name && <span aria-hidden className={cn("text-[10px] font-medium", d.isToday ? "text-primary-foreground/85" : d.isLate ? "text-overdue-foreground" : "text-zinc-600")}>{d.name}</span>}
      <span aria-hidden>{d.n}</span>
      <span className="sr-only">{d.spoken}</span>
      {d.has && <span aria-hidden className={cn("absolute bottom-1.5 size-1 rounded-full", d.isToday ? "bg-primary-foreground" : d.isLate ? "bg-overdue-foreground" : "bg-zinc-900")} />}
    </>
  );
  return (
    <li>
      {d.has ? <Link href={d.href} className={cn(cls, "hover:ring-1 hover:ring-zinc-300")}>{body}</Link> : <span className={cls}>{body}</span>}
    </li>
  );
}

const spoken = (label: string, isToday: boolean, isLate: boolean, has: boolean) =>
  `${label}${isToday ? ", today" : ""}${isLate ? ", something overdue" : has ? ", something on" : ""}`;

/** This month: overdue days in red, days with something on them dotted, today filled. */
export function MiniMonth({ cal }: { cal: HomeCalendar }) {
  const [y, m] = cal.month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const todayN = Number(cal.today.slice(8, 10));
  const late = new Set(cal.overdueDays);
  const busy = new Set(cal.busyDays);
  const days: Day[] = Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const isToday = n === todayN;
    const isLate = late.has(n);
    const has = isLate || busy.has(n);
    return { key: String(n), n, isToday, isLate, has, href: `/planner?view=calendar&month=${cal.month}`, spoken: spoken(`${n} ${monthLabel(cal.month)}`, isToday, isLate, has) };
  });
  return (
    <div className="flex flex-col gap-2">
      <WeekStrip cal={cal} />
      <div className="hidden flex-col gap-1 sm:flex">
        <div aria-hidden className="grid grid-cols-7 gap-1">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span key={i} className="py-1 text-center text-[11px] font-medium text-muted-foreground">{d}</span>)}
        </div>
        <ol aria-label={monthLabel(cal.month)} className="grid grid-cols-7 gap-1">
          {Array.from({ length: first }, (_, i) => <li key={`e${i}`} aria-hidden />)}
          {days.map((d) => <DayCell key={d.key} d={d} />)}
        </ol>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] border border-overdue-border bg-overdue" />Overdue</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-zinc-900" />Something on</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] bg-primary" />Today</span>
      </p>
    </div>
  );
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** On a phone: this week (Sunday to Saturday) as one row, with the same marks as the month. */
function WeekStrip({ cal }: { cal: HomeCalendar }) {
  const today = new Date(`${cal.today}T00:00:00Z`);
  const late = new Set(cal.overdueDays);
  const busy = new Set(cal.busyDays);
  const days: Day[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - today.getUTCDay() + i);
    const iso = d.toISOString().slice(0, 10);
    const n = d.getUTCDate();
    const inMonth = iso.slice(0, 7) === cal.month;
    const isToday = iso === cal.today;
    const isLate = inMonth && late.has(n);
    const has = inMonth && (isLate || busy.has(n));
    return { key: iso, n, name: DAY_NAMES[i], isToday, isLate, has, dim: !inMonth, href: `/planner?view=calendar&month=${iso.slice(0, 7)}`, spoken: spoken(`${DAY_NAMES[i]} ${n}`, isToday, isLate, has) };
  });
  return (
    <ol aria-label="This week" className="grid grid-cols-7 gap-1 sm:hidden">
      {days.map((d) => <DayCell key={d.key} d={d} tall />)}
    </ol>
  );
}

/** Latest first, joined by a line. */
export function RecentUpdates({ items }: { items: { key: string; title: string; detail: string; href: string }[] }) {
  if (!items.length) return <p className="px-5 pb-5 text-sm text-muted-foreground">Nothing recorded yet.</p>;
  return (
    <ol className="px-5 pb-3">
      {items.map((it, i) => (
        <li key={it.key} className="grid grid-cols-[12px_minmax(0,1fr)] gap-x-3">
          <span aria-hidden className="relative">
            <span className={cn("absolute left-[5.5px] w-px bg-zinc-200", i === 0 ? "top-3.5" : "top-0", i === items.length - 1 ? "h-3" : "bottom-0")} />
            <span className={cn("absolute rounded-full ring-3 ring-card", i === 0 ? "top-2.5 left-px size-2.5 bg-zinc-900" : "top-[11px] left-0.5 size-2 bg-zinc-400")} />
          </span>
          <Link href={it.href} className="-ml-2 block rounded-md px-2 pt-1 pb-2 hover:bg-zinc-50">
            <span className="block font-medium">{it.title}</span>
            <span className="block text-[13px] text-muted-foreground">{it.detail}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function Areas({ areas }: { areas: Area[] }) {
  return (
    <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
      {areas.map((a) => (
        <li key={a.key}>
          <Link href={a.href} className="flex items-center gap-3 px-5 py-2.5 hover:bg-zinc-50">
            <span className="min-w-0 flex-1 font-medium">{a.label}</span>
            <span className="text-[12px] text-muted-foreground">{a.detail}</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
