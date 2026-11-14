import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "cn";
import { asUser } from "@/server/auth";
import { getCalendar, listGoals, listTasks, openTaskOptions, taskCounts } from "@/server/planner";
import { projectOptions, requireProfile } from "@/server/profile";
import { formatPartialDate, isMonthKey, monthLabel, todayIn } from "@/lib/dates";
import { PageHeader } from "@/components/app/ui";
import { Button } from "@/components/ui/button";
import { TaskList, AddTask, Goals } from "./planner-client";

export const metadata: Metadata = { title: "Planner" };

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

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
    const tasks = view === "tasks" ? await listTasks(tx, show, limit + 1) : [];
    return {
      today,
      month,
      counts: await taskCounts(tx),
      tasks: tasks.slice(0, limit),
      moreTasks: tasks.length > limit,
      projects: await projectOptions(tx),
      taskOptions: view === "tasks" ? await openTaskOptions(tx) : [],
      calendar: view === "calendar" ? await getCalendar(tx, month, today) : null,
      goals: view === "goals" ? await listGoals(tx) : [],
    };
  });

  const tab = (v: string, label: string) => (
    <Link
      href={`/planner${v === "tasks" ? "" : `?view=${v}`}`}
      role="tab"
      aria-selected={view === v}
      className={cn("-mb-px inline-flex h-10 items-center border-b-2 px-0.5 font-medium", view === v ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5">
      <PageHeader title="Planner" subtitle="What needs doing, and when." />
      <div role="tablist" aria-label="Planner views" data-guide="planner-views" className="flex gap-5 border-b">
        {tab("tasks", "Tasks")}
        {tab("calendar", "Calendar")}
        {tab("goals", "Goals")}
      </div>

      {view === "tasks" && (
        <>
          <AddTask projects={data.projects} />
          <div role="group" aria-label="Show" data-guide="planner-show" className="flex w-fit flex-wrap gap-1 rounded-[10px] bg-muted p-1">
            {([["open", `Open · ${data.counts.open}`], ["waiting", `Waiting · ${data.counts.waiting}`], ["done", "Done"]] as const).map(([k, label]) => (
              <Link key={k} href={k === "open" ? "/planner" : `/planner?show=${k}`} aria-current={show === k ? "true" : undefined}
                className={cn("flex h-8 items-center rounded-md px-3 text-[13px] font-medium", show === k ? "bg-background text-foreground shadow-xs" : "text-zinc-600")}>
                {label}
              </Link>
            ))}
          </div>
          <TaskList tasks={data.tasks} projects={data.projects} taskOptions={data.taskOptions} today={data.today} empty={show === "done" ? "Nothing finished yet." : show === "waiting" ? "Nothing is waiting." : "Nothing to do. Add a task above."} />
          {data.moreTasks && (
            <Link
              href={`/planner?${new URLSearchParams({ ...(show === "open" ? {} : { show }), limit: String(limit + 300) }).toString()}`}
              scroll={false}
              className="self-center rounded-lg border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Show more
            </Link>
          )}
        </>
      )}

      {view === "calendar" && data.calendar && (
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">{monthLabel(data.month)}</h2>
            <div className="flex gap-1.5">
              <Button asChild size="icon-sm" variant="outline"><Link href={`/planner?view=calendar&month=${shiftMonth(data.month, -1)}`} aria-label="Previous month"><ChevronLeft /></Link></Button>
              <Button asChild size="sm" variant="outline"><Link href="/planner?view=calendar">Today</Link></Button>
              <Button asChild size="icon-sm" variant="outline"><Link href={`/planner?view=calendar&month=${shiftMonth(data.month, 1)}`} aria-label="Next month"><ChevronRight /></Link></Button>
            </div>
          </div>
          <MonthGrid month={data.month} today={data.today} items={data.calendar.exact} />
          {data.calendar.exact.length === 0 && <p className="text-[13px] text-muted-foreground">Nothing this month has an exact date. Dates come from your tasks, entries and milestones — nothing is entered twice.</p>}
          <div className="border-t border-zinc-100 pt-3">
            <p className="font-medium">This month, no exact day</p>
            {data.calendar.monthOnly.length ? (
              <ul className="mt-1 flex flex-col gap-1">{data.calendar.monthOnly.map((m, i) => <li key={i}><Link href={m.href} className="underline-offset-4 hover:underline">{m.title}</Link></li>)}</ul>
            ) : <p className="text-[13px] text-muted-foreground">None.</p>}
          </div>
          {data.calendar.next && (
            <div className="border-t border-zinc-100 pt-3">
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
