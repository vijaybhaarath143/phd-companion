"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
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
import { PriorityMark } from "@/components/app/priority";
import type { GoalRow, TaskRow } from "@/server/planner";
import type { PublicationOption } from "@/server/profile";

/** Opens Quick Add on Task, like Add on the Timeline; the list refreshes once it's saved. */
export function AddTaskButton() {
  const { open } = useQuickAdd();
  return (
    <Button type="button" data-guide="planner-add" onClick={() => open({ mode: "task" })}>
      <Plus className="size-4" aria-hidden /> Add task
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

export function TaskList({ tasks, publications, taskOptions, today, empty }: { tasks: TaskRow[]; publications: PublicationOption[]; taskOptions: { id: string; title: string }[]; today: string; empty: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!tasks.length) return <p className="rounded-2xl border-2 bg-card shadow-edge px-5 py-8 text-center text-muted-foreground">{empty}</p>;
  return (
    <section className="rounded-2xl border-2 bg-card shadow-edge">
      <ul className="divide-y-2 divide-zinc-100">
        {tasks.map((t) => {
          const overdue = t.dueDate && t.dueDate < today && !["done", "cancelled"].includes(t.status);
          const done = t.status === "done" || t.status === "cancelled";
          const bits = context(t);
          return (
            <li key={t.id} className="flex flex-col">
              <div className="flex min-h-14 items-center gap-3 px-5 py-3">
                <TaskCheckbox id={t.id} title={t.title} done={t.status === "done"} />
                <button type="button" onClick={() => setEditing(editing === t.id ? null : t.id)} className="min-w-0 flex-1 text-left">
                  <span className={`block font-medium ${done ? "text-muted-foreground line-through" : ""}`}>{t.title}<PriorityMark priority={t.priority} className="ml-2 align-[1px]" /></span>
                  <span className="block text-[13px] text-muted-foreground">
                    {[...bits, t.dueDate ? `due ${formatFullDay(t.dueDate)}` : "no due date"].join(" · ")}
                    {t.status === "waiting" && (t.waitingReason || t.waitingOnTitle) ? ` · ${t.waitingOnTitle ? `waiting on “${t.waitingOnTitle}”` : t.waitingReason}` : ""}
                    {viaLabel(t.changedVia) ? ` · updated via ${viaLabel(t.changedVia)}` : viaLabel(t.createdVia) ? ` · added via ${viaLabel(t.createdVia)}` : ""}
                  </span>
                </button>
                {overdue && <Badge variant="overdue">Overdue</Badge>}
                {t.status === "waiting" && <Badge variant="attention">Waiting</Badge>}
                {t.status === "doing" && <Badge variant="info">Doing</Badge>}
                {t.status === "cancelled" && <Badge variant="muted">Cancelled</Badge>}
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
        })}
      </ul>
    </section>
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
