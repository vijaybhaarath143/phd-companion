import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { asUser } from "@/server/auth";
import { getCalendar, listGoals, listTasks, openTaskOptions, taskCounts } from "@/server/planner";
import { publicationOptions, requireProfile } from "@/server/profile";
import { formatPartialDate, isMonthKey, monthLabel, shiftMonth, todayIn } from "@/lib/dates";
import { PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { TaskList, AddTaskButton, Goals, PlannerSide } from "./planner-client";

export const metadata: Metadata = { title: "Planner" };

export default async function PlannerPage({ searchParams }: PageProps<"/planner">) {
  const sp = await searchParams;
  const view = sp.view === "calendar" || sp.view === "goals" ? sp.view : "tasks";
  const show = sp.show === "waiting" || sp.show === "done" ? sp.show : "open";

  // how many tasks to show ("Show more" adds 300); anything odd in the address falls back to 300
  const limit = Math.min(Math.max(Math.trunc(Number(sp.limit)) || 300, 300), 5000);

  const data = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    const today = todayIn(profile.timezone);
    const month = isMonthKey(sp.month) ? sp.month : today.slice(0, 7);
    const tasks = view === "tasks" ? await listTasks(tx, show, limit + 1, today) : [];
    return {
      today,
      month,
      counts: await taskCounts(tx),
      tasks: tasks.slice(0, limit),
      moreTasks: tasks.length > limit,
      publications: await publicationOptions(tx),
      taskOptions: view === "tasks" ? await openTaskOptions(tx) : [],
      calendar: view === "calendar" ? await getCalendar(tx, month, today) : null,
      goals: view === "calendar" ? [] : await listGoals(tx),
    };
  });

  const tab = (v: string, label: string) => (
    <Link
      href={`/planner${v === "tasks" ? "" : `?view=${v}`}`}
      role="tab"
      aria-selected={view === v}
      className={cn("flex h-10 items-center rounded-xl px-4 font-display text-sm font-extrabold transition-colors", view === v ? "bg-card text-foreground shadow-[0_2px_0_var(--border)]" : "text-zinc-600 hover:text-foreground")}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <PageHeader eyebrow="Planner" title="What needs doing, and when" actions={<AddTaskButton />} />
      <div role="tablist" aria-label="Planner views" data-guide="planner-views" className="flex w-fit gap-1 rounded-2xl bg-muted p-1">
        {tab("tasks", "Tasks")}
        {tab("calendar", "Calendar")}
        {tab("goals", "Goals")}
      </div>

      {view === "tasks" && (
        <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-5">
          <div role="group" aria-label="Show" data-guide="planner-show" className="flex w-fit flex-wrap gap-2">
            {([["open", `Open · ${data.counts.open}`], ["waiting", `Waiting · ${data.counts.waiting}`], ["done", "Done"]] as const).map(([k, label]) => (
              <Link key={k} href={k === "open" ? "/planner" : `/planner?show=${k}`} aria-current={show === k ? "true" : undefined}
                className={cn("flex h-10 items-center rounded-full border-2 px-4 font-display text-sm font-extrabold transition-colors", show === k ? "border-sky-soft bg-sky-soft text-sky-strong" : "bg-card text-zinc-600 hover:text-foreground")}>
                {label}
              </Link>
            ))}
          </div>
          <TaskList grouped={show === "open"} tasks={data.tasks} publications={data.publications} taskOptions={data.taskOptions} today={data.today} empty={show === "done" ? "Nothing finished yet." : show === "waiting" ? "Nothing is waiting." : "Nothing to do. Use New task to plan your next step."} />
          {data.moreTasks && (
            <Link
              href={`/planner?${new URLSearchParams({ ...(show === "open" ? {} : { show }), limit: String(limit + 300) }).toString()}`}
              scroll={false}
              className="self-center rounded-xl border-2 bg-card px-4 py-2 font-display text-sm font-extrabold shadow-edge transition-transform duration-75 hover:bg-zinc-50 active:translate-y-1 active:shadow-none"
            >
              Show more
            </Link>
          )}
        </div>
        <div className="min-w-0 flex-[1_1_280px]">
          <PlannerSide goals={data.goals} doneThisWeek={data.counts.doneThisWeek} />
        </div>
        </div>
      )}

      {view === "calendar" && data.calendar && (
        <section className="flex flex-col gap-4 rounded-2xl border-2 bg-card shadow-edge p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-extrabold">{monthLabel(data.month)}</h2>
            <div className="flex gap-1.5">
              <Button asChild size="icon-sm" variant="outline"><Link href={`/planner?view=calendar&month=${shiftMonth(data.month, -1)}`} aria-label="Previous month"><ChevronLeft /></Link></Button>
              <Button asChild size="sm" variant="outline"><Link href="/planner?view=calendar">Today</Link></Button>
              <Button asChild size="icon-sm" variant="outline"><Link href={`/planner?view=calendar&month=${shiftMonth(data.month, 1)}`} aria-label="Next month"><ChevronRight /></Link></Button>
            </div>
          </div>
          <MonthGrid month={data.month} today={data.today} items={data.calendar.exact} />
          {data.calendar.exact.length === 0 && <p className="text-[13px] text-muted-foreground">Nothing this month has an exact date. Dates come from your tasks, entries and milestones — nothing is entered twice.</p>}
          <div className="border-t-2 border-zinc-100 pt-3">
            <p className="font-medium">This month, no exact day</p>
            {data.calendar.monthOnly.length ? (
              <ul className="mt-1 flex flex-col gap-1">{data.calendar.monthOnly.map((m, i) => <li key={i}><Link href={m.href} className="underline-offset-4 hover:underline">{m.title}</Link></li>)}</ul>
            ) : <p className="text-[13px] text-muted-foreground">None.</p>}
          </div>
          {data.calendar.next && (
            <div className="border-t-2 border-zinc-100 pt-3">
              <p className="font-medium">Next planned</p>
              <Link href={data.calendar.next.href} className="text-[13px] underline-offset-4 hover:underline">
                {formatPartialDate(data.calendar.next.date, data.calendar.next.precision)} · {data.calendar.next.title}
              </Link>
            </div>
          )}
        </section>
      )}

      {view === "goals" && <Goals goals={data.goals} today={data.today} />}
    </div>
  );
}

function MonthGrid({ month, today, items }: { month: string; today: string; items: { date: string; title: string; href: string }[] }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = Sunday
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const byDay = new Map<number, typeof items>();
  for (const it of items) {
    const d = Number(it.date.slice(8, 10));
    byDay.set(d, [...(byDay.get(d) ?? []), it]);
  }
  return (
    <div className="grid grid-cols-7 gap-1" role="grid" aria-label={monthLabel(month)}>
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
        <div key={d} role="columnheader" className="py-1.5 text-center text-xs font-medium text-muted-foreground">{d}</div>
      ))}
      {cells.map((d, i) => {
        if (d === null) return <div key={`e${i}`} />;
        const date = `${month}-${String(d).padStart(2, "0")}`;
        const isToday = date === today;
        const its = byDay.get(d) ?? [];
        return (
          <div key={date} role="gridcell" className={cn("min-h-16 rounded-lg p-1.5 text-[13px] tabular-nums", isToday ? "bg-primary text-primary-foreground" : "bg-zinc-50 text-zinc-700")}>
            <span className={isToday ? "font-semibold" : ""}>{d}</span>
            {its.map((it, j) => (
              <Link key={j} href={it.href} className={cn("mt-1 block truncate rounded px-1 text-xs", isToday ? "bg-white/15" : "bg-white ring-1 ring-zinc-200")} title={it.title}>{it.title}</Link>
            ))}
          </div>
        );
      })}
    </div>
  );
}
