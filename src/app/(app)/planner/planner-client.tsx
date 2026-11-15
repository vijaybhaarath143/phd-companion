"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/app/app-select";
import { toOptions, rowOptions } from "@/lib/options";
import { ActionForm } from "@/components/app/action-form";
import { TaskCheckbox } from "@/components/app/task-checkbox";
import { useQuickAdd } from "@/components/app/quick-add";
import { quickAction, trashWithUndo } from "@/components/app/call-action";
import { trashTask, updateTask } from "@/server/actions/tasks";
import { addGoal, setGoalOutcome, trashGoal, undoTrash, updateGoal } from "@/server/actions/settings";
import { formatFullDay } from "@/lib/dates";
import { goalHorizons, goalOutcomes, taskPriorities, taskStatuses, viaLabel } from "@/lib/labels";
import { PriorityDot } from "@/components/app/priority";
import type { GoalRow, TaskRow } from "@/server/planner";
import type { PublicationOption } from "@/server/profile";

/** Opens Quick Add on Task, like Add on the Timeline; the list refreshes once it's saved. */
export function AddTaskButton() {
  const { open } = useQuickAdd();
  return (
    <Button type="button" data-guide="planner-add" onClick={() => open({ mode: "task" })}>
      <Plus strokeWidth={2.8} aria-hidden /> New task
    </Button>
  );
}

function context(t: TaskRow) {
  const bits: string[] = [];
  if (t.manuscriptTitle) bits.push(t.manuscriptTitle.split(":")[0]);
  else if (t.courseName) bits.push(t.courseName);
  if (t.originTitle) bits.push(`from “${t.originTitle}”`);
  return bits;
}

type Group = { key: string; label: string; tone?: "overdue" | "attention"; tasks: TaskRow[] };

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Open tasks by when they're due; waiting ones together at the end, whatever their date. */
function groupTasks(tasks: TaskRow[], today: string): Group[] {
  const week = addDays(today, 7);
  const groups: Group[] = [
    { key: "overdue", label: "Overdue", tone: "overdue", tasks: [] },
    { key: "today", label: "Today", tasks: [] },
    { key: "week", label: "Next 7 days", tasks: [] },
    { key: "later", label: "Later", tasks: [] },
    { key: "undated", label: "No due date", tasks: [] },
    { key: "waiting", label: "Waiting on someone", tone: "attention", tasks: [] },
  ];
  const at = (k: string) => groups.find((g) => g.key === k)!.tasks;
  for (const t of tasks) {
    if (t.status === "waiting") at("waiting").push(t);
    else if (!t.dueDate) at("undated").push(t);
    else if (t.dueDate < today) at("overdue").push(t);
    else if (t.dueDate === today) at("today").push(t);
    else if (t.dueDate <= week) at("week").push(t);
    else at("later").push(t);
  }
  return groups.filter((g) => g.tasks.length > 0);
}

const shortDay = (d: string) => formatFullDay(d).replace(/ \d{4}$/, "");

export function TaskList({ tasks, publications, taskOptions, today, empty, grouped = false }: { tasks: TaskRow[]; publications: PublicationOption[]; taskOptions: { id: string; title: string }[]; today: string; empty: string; grouped?: boolean }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!tasks.length) return <p className="rounded-2xl border-2 bg-card px-5 py-8 text-center text-muted-foreground shadow-edge">{empty}</p>;
  const groups: Group[] = grouped ? groupTasks(tasks, today) : [{ key: "all", label: "", tasks }];

  const row = (t: TaskRow) => {
    const overdue = t.dueDate && t.dueDate < today && !["done", "cancelled"].includes(t.status);
    const done = t.status === "done" || t.status === "cancelled";
    const bits = context(t);
    const waitingOn = t.status === "waiting" && (t.waitingReason || t.waitingOnTitle) ? (t.waitingOnTitle ? `waiting on “${t.waitingOnTitle}”` : t.waitingReason) : null;
    return (
      <li key={t.id} className="flex flex-col">
        <div className="flex min-h-16 items-center gap-3.5 px-4 py-3 sm:px-5">
          <TaskCheckbox id={t.id} title={t.title} done={t.status === "done"} />
          <PriorityDot priority={t.priority} />
          <button type="button" onClick={() => setEditing(editing === t.id ? null : t.id)} className="min-w-0 flex-1 text-left" aria-expanded={editing === t.id}>
            <span className={`block font-display text-[15px] leading-snug font-extrabold ${done ? "text-muted-foreground line-through" : ""}`}>{t.title}</span>
            {(bits.length > 0 || waitingOn || viaLabel(t.changedVia) || viaLabel(t.createdVia)) && (
              <span className="block text-[13px] text-muted-foreground">
                {[...bits, waitingOn].filter(Boolean).join(" · ")}
                {viaLabel(t.changedVia) ? `${bits.length || waitingOn ? " · " : ""}updated via ${viaLabel(t.changedVia)}` : viaLabel(t.createdVia) ? `${bits.length || waitingOn ? " · " : ""}added via ${viaLabel(t.createdVia)}` : ""}
              </span>
            )}
          </button>
          <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {t.status === "doing" && <Badge variant="info">Doing</Badge>}
            {t.status === "cancelled" && <Badge variant="muted">Cancelled</Badge>}
            {t.remindUntilDone && !done && <Badge variant="outline">Reminding</Badge>}
            {t.dueDate ? <Badge variant={overdue ? "overdue" : "muted"}>{done ? shortDay(t.dueDate) : overdue ? `Was due ${shortDay(t.dueDate)}` : t.dueDate === today ? "Today" : shortDay(t.dueDate)}</Badge> : null}
          </span>
        </div>
        {editing === t.id && (
                <ActionForm action={updateTask.bind(null, t.id)} success="Task saved" reset={false} onDone={() => setEditing(null)} className="mx-5 mb-4 grid grid-cols-1 gap-3 rounded-xl border-2 bg-zinc-50 p-4 sm:grid-cols-2">
                  <input type="hidden" name="version" value={t.version} />
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-sm font-medium" htmlFor={`t-title-${t.id}`}>Title</label>
                    <Input id={`t-title-${t.id}`} name="title" defaultValue={t.title} required maxLength={300} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`t-status-${t.id}`}>Status</label>
                    <AppSelect id={`t-status-${t.id}`} name="status" defaultValue={t.status} options={toOptions(taskStatuses)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`t-due-${t.id}`}>Due date</label>
                    <Input id={`t-due-${t.id}`} type="date" name="dueDate" defaultValue={t.dueDate ?? ""} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`t-pri-${t.id}`}>Priority</label>
                    <AppSelect id={`t-pri-${t.id}`} name="priority" defaultValue={t.priority} options={toOptions(taskPriorities)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`t-pub-${t.id}`}>Publication</label>
                    <AppSelect id={`t-pub-${t.id}`} name="manuscriptId" defaultValue={t.manuscriptId ?? ""} options={rowOptions(publications, (p) => p.title.split(":")[0], "Not about a publication")} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`t-wr-${t.id}`}>If waiting: why?</label>
                    <Input id={`t-wr-${t.id}`} name="waitingReason" defaultValue={t.waitingReason ?? ""} placeholder="e.g. Waiting for the guide's feedback" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`t-wo-${t.id}`}>If waiting: on which task?</label>
                    <AppSelect id={`t-wo-${t.id}`} name="waitingOnTaskId" defaultValue={t.waitingOnTaskId ?? ""} options={rowOptions(taskOptions.filter((o) => o.id !== t.id), (o) => o.title, "No task")} />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm sm:col-span-2">
                    <input type="checkbox" name="remindUntilDone" defaultChecked={t.remindUntilDone} className="size-[18px] accent-primary" />
                    Keep reminding me until it&apos;s done
                  </label>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-sm font-medium" htmlFor={`t-notes-${t.id}`}>Notes</label>
                    <Textarea id={`t-notes-${t.id}`} name="notes" rows={2} defaultValue={t.notes ?? ""} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
                    <div className="flex gap-2">
                      <Button type="submit">Save</Button>
                      <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                    <div className="flex items-center gap-3">
                      {t.originEntryId && <Link href={`/journal/${t.originEntryId}`} className="text-[13px] underline-offset-4 hover:underline">Open source entry</Link>}
                      <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => { await trashWithUndo({ what: "Task", trash: () => trashTask(t.id), undo: () => undoTrash("tasks", t.id) }); })}>Move to Trash</Button>
                    </div>
                  </div>
                </ActionForm>
              )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label || "Tasks"} className="rounded-2xl border-2 bg-card shadow-edge">
          {g.label && (
            <div className="flex items-center gap-2.5 px-5 pt-4 pb-2">
              <h2 className={g.tone === "overdue" ? "text-[19px] text-overdue-foreground" : "text-[19px]"}>{g.label}</h2>
              <Badge variant={g.tone === "overdue" ? "overdue" : g.tone === "attention" ? "attention" : "muted"}>{g.tasks.length}</Badge>
            </div>
          )}
          <ul className="divide-y-2 divide-zinc-100">{g.tasks.map(row)}</ul>
        </section>
      ))}
    </div>
  );
}

/** The Planner's side column: open goals, and a quiet note on what she finished this week. */
export function PlannerSide({ goals, doneThisWeek }: { goals: GoalRow[]; doneThisWeek: number }) {
  const open = goals.filter((g) => g.outcome === "open").slice(0, 4);
  return (
    <aside className="flex min-w-0 flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-2xl border-2 bg-card p-5 shadow-edge">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[19px]">Goals</h2>
          <Link href="/planner?view=goals" className="font-display text-[13px] font-extrabold text-sky hover:underline">{open.length ? "All goals" : "Set one"}</Link>
        </div>
        {open.length ? (
          <ul className="flex flex-col gap-3">
            {open.map((g) => (
              <li key={g.id} className="flex flex-col gap-0.5">
                <span className="font-display text-[15px] leading-snug font-extrabold">{g.title}</span>
                <span className="text-[13px] text-muted-foreground">
                  {goalHorizons[g.horizon as keyof typeof goalHorizons]}
                  {g.periodEnd ? ` · until ${formatFullDay(g.periodEnd)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">No open goals. A goal for this month or semester keeps the bigger picture in view.</p>
        )}
      </section>
      {doneThisWeek > 0 && (
        <section className="flex items-center gap-3.5 rounded-2xl bg-leaf-soft p-5">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_3px_0_var(--primary-edge)]">
            <Check className="size-5" strokeWidth={3} />
          </span>
          <p className="font-display text-[15px] leading-snug font-extrabold text-leaf-strong">
            {doneThisWeek === 1 ? "1 task" : `${doneThisWeek} tasks`} finished in the last 7 days. Good going.
          </p>
        </section>
      )}
    </aside>
  );
}

/** Title, horizon and period of a goal — shared by "New goal" and "Edit". */
function GoalFields({ goal, today }: { goal?: GoalRow; today: string }) {
  const p = goal?.id ?? "new";
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`g-title-${p}`} className="text-sm font-medium">Goal</label>
        <Input id={`g-title-${p}`} name="title" required maxLength={300} defaultValue={goal?.title} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`g-h-${p}`} className="text-sm font-medium">For</label>
          <AppSelect id={`g-h-${p}`} name="horizon" defaultValue={goal?.horizon ?? "month"} options={toOptions(goalHorizons)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`g-s-${p}`} className="text-sm font-medium">From <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input id={`g-s-${p}`} type="date" name="start" defaultValue={goal ? goal.periodStart ?? "" : today} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`g-e-${p}`} className="text-sm font-medium">To <span className="font-normal text-muted-foreground">(optional)</span></label>
          <Input id={`g-e-${p}`} type="date" name="end" defaultValue={goal?.periodEnd ?? ""} />
        </div>
      </div>
    </>
  );
}

export function Goals({ goals, today }: { goals: GoalRow[]; today: string }) {
  const [adding, setAdding] = useState(goals.length === 0);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      {goals.length > 0 && (
        <section className="rounded-2xl border-2 bg-card shadow-edge">
          <ul className="divide-y-2 divide-zinc-100">
            {goals.map((g) => (
              <li key={g.id} className="flex flex-col">
                <div className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-[1_1_240px]">
                    <span className="block font-medium">{g.title}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      {goalHorizons[g.horizon as keyof typeof goalHorizons]}
                      {g.periodStart ? ` · ${formatFullDay(g.periodStart)}${g.periodEnd ? ` – ${formatFullDay(g.periodEnd)}` : ""}` : ""}
                    </span>
                  </span>
                  <div role="radiogroup" aria-label={`Outcome of ${g.title}`} className="flex gap-1 rounded-[10px] bg-muted p-1">
                    {Object.entries(goalOutcomes).map(([k, v]) => (
                      <button key={k} type="button" role="radio" aria-checked={g.outcome === k} disabled={pending}
                        onClick={() => start(async () => void (await quickAction(() => setGoalOutcome(g.id, k))))}
                        className={`h-8 rounded-md px-3 text-[13px] font-medium ${g.outcome === k ? "bg-background shadow-xs" : "text-zinc-600"}`}>{v}</button>
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(editing === g.id ? null : g.id)}>Edit</Button>
                </div>
                {editing === g.id && (
                  <ActionForm action={updateGoal.bind(null, g.id)} success="Goal saved" reset={false} onDone={() => setEditing(null)} className="mx-5 mb-4 flex flex-col gap-3 rounded-xl border-2 bg-zinc-50 p-4">
                    <input type="hidden" name="version" value={g.version} />
                    <GoalFields goal={g} today={today} />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex gap-2">
                        <Button type="submit">Save</Button>
                        <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                      <Button type="button" variant="ghost" disabled={pending}
                        onClick={() => start(async () => { await trashWithUndo({ what: "Goal", trash: () => trashGoal(g.id), undo: () => undoTrash("goals", g.id) }); })}>
                        Move to Trash
                      </Button>
                    </div>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {adding ? (
        <ActionForm action={addGoal} success="Goal added" onDone={() => setAdding(goals.length === 0)} className="flex flex-col gap-4 rounded-2xl border-2 bg-card shadow-edge p-5">
          <h2 className="text-[15px] font-extrabold">{goals.length ? "New goal" : "Set a goal"}</h2>
          <p className="-mt-2 text-[13px] text-muted-foreground">For this week, month, semester or year. Mark it achieved or dropped when the time comes.</p>
          <GoalFields today={today} />
          <Button type="submit" className="self-start">Add goal</Button>
        </ActionForm>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>Add a goal</Button>
      )}
    </div>
  );
}
