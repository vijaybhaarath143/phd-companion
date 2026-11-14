"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { ActionForm } from "@/components/app/action-form";
import { createTask, toggleTask, trashTask, updateTask } from "@/server/actions/tasks";
import { addGoal, setGoalOutcome } from "@/server/actions/settings";
import { formatFullDay } from "@/lib/dates";
import { goalHorizons, goalOutcomes, taskStatuses } from "@/lib/labels";
import type { GoalRow, TaskRow } from "@/server/planner";
import type { ProjectOption } from "@/server/profile";

export function AddTask({ projects }: { projects: ProjectOption[] }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [projectId, setProjectId] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        start(async () => {
          const r = await createTask({ id: crypto.randomUUID(), title, dueDate: due || null, priority: "normal", projectId: projectId || null, notes: null });
          if (!r.ok) return void toast.error(r.error.message);
          setTitle("");
          setDue("");
        });
      }}
    >
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" aria-label="New task" className="min-w-0 flex-[1_1_260px]" />
      <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" className="w-44" />
      <NativeSelect value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Project (optional)" className="w-48">
        <option value="">No project</option>
        {projects.map((p) => <option key={p.id} value={p.id}>{p.title.split(":")[0]}</option>)}
      </NativeSelect>
      <Button type="submit" disabled={pending || !title.trim()}>Add</Button>
    </form>
  );
}

function context(t: TaskRow) {
  const bits: string[] = [];
  if (t.projectTitle) bits.push(t.projectTitle.split(":")[0]);
  else if (t.courseName) bits.push(t.courseName);
  if (t.originTitle) bits.push(`from “${t.originTitle}”`);
  return bits;
}

export function TaskList({ tasks, projects, taskOptions, today, empty }: { tasks: TaskRow[]; projects: ProjectOption[]; taskOptions: { id: string; title: string }[]; today: string; empty: string }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!tasks.length) return <p className="rounded-xl border bg-card px-5 py-8 text-center text-muted-foreground">{empty}</p>;
  return (
    <section className="rounded-xl border bg-card">
      <ul className="divide-y divide-zinc-100">
        {tasks.map((t) => {
          const overdue = t.dueDate && t.dueDate < today && !["done", "cancelled"].includes(t.status);
          const done = t.status === "done" || t.status === "cancelled";
          const bits = context(t);
          return (
            <li key={t.id} className="flex flex-col">
              <div className="flex min-h-14 items-center gap-3 px-5 py-3">
                <input type="checkbox" className="size-[18px] shrink-0 accent-zinc-900" aria-label={`Done: ${t.title}`} checked={t.status === "done"} disabled={pending}
                  onChange={(e) => start(async () => void (await toggleTask(t.id, e.target.checked)))} />
                <button type="button" onClick={() => setEditing(editing === t.id ? null : t.id)} className="min-w-0 flex-1 text-left">
                  <span className={`block font-medium ${done ? "text-muted-foreground line-through" : ""}`}>{t.title}{t.priority === "important" && <span className="ml-2 text-[12px] font-normal text-attention-foreground">Important</span>}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {[...bits, t.dueDate ? `due ${formatFullDay(t.dueDate)}` : "no due date"].join(" · ")}
                    {t.status === "waiting" && (t.waitingReason || t.waitingOnTitle) ? ` · ${t.waitingOnTitle ? `waiting on “${t.waitingOnTitle}”` : t.waitingReason}` : ""}
                  </span>
                </button>
                {overdue && <Badge variant="attention">Overdue</Badge>}
                {t.status === "waiting" && <Badge variant="attention">Waiting</Badge>}
                {t.status === "doing" && <Badge variant="outline">Doing</Badge>}
                {t.status === "cancelled" && <Badge variant="muted">Cancelled</Badge>}
              </div>
              {editing === t.id && (
                <ActionForm action={updateTask.bind(null, t.id)} success="Task saved" reset={false} onDone={() => setEditing(null)} className="mx-5 mb-4 grid grid-cols-1 gap-3 rounded-lg border bg-zinc-50 p-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label className="text-sm font-medium" htmlFor={`t-title-${t.id}`}>Title</label>
                    <Input id={`t-title-${t.id}`} name="title" defaultValue={t.title} required />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`t-status-${t.id}`}>Status</label>
                    <NativeSelect id={`t-status-${t.id}`} name="status" defaultValue={t.status}>
                      {Object.entries(taskStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </NativeSelect>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`t-due-${t.id}`}>Due date</label>
                    <Input id={`t-due-${t.id}`} type="date" name="dueDate" defaultValue={t.dueDate ?? ""} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`t-pri-${t.id}`}>Priority</label>
                    <NativeSelect id={`t-pri-${t.id}`} name="priority" defaultValue={t.priority}>
                      <option value="normal">Normal</option>
                      <option value="important">Important</option>
                    </NativeSelect>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`t-proj-${t.id}`}>Project</label>
                    <NativeSelect id={`t-proj-${t.id}`} name="projectId" defaultValue={t.projectId ?? ""}>
                      <option value="">No project</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.title.split(":")[0]}</option>)}
                    </NativeSelect>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`t-wr-${t.id}`}>If waiting: why?</label>
                    <Input id={`t-wr-${t.id}`} name="waitingReason" defaultValue={t.waitingReason ?? ""} placeholder="e.g. Waiting for the guide's feedback" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium" htmlFor={`t-wo-${t.id}`}>If waiting: on which task?</label>
                    <NativeSelect id={`t-wo-${t.id}`} name="waitingOnTaskId" defaultValue={t.waitingOnTaskId ?? ""}>
                      <option value="">No task</option>
                      {taskOptions.filter((o) => o.id !== t.id).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                    </NativeSelect>
                  </div>
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
                      <Button type="button" variant="ghost" onClick={() => start(async () => { if (confirm("Move this task to Trash?")) await trashTask(t.id); })}>Move to Trash</Button>
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

export function Goals({ goals, today }: { goals: GoalRow[]; today: string }) {
  const [adding, setAdding] = useState(goals.length === 0);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-4">
      {goals.length > 0 && (
        <section className="rounded-xl border bg-card">
          <ul className="divide-y divide-zinc-100">
            {goals.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
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
                      onClick={() => start(async () => void (await setGoalOutcome(g.id, k)))}
                      className={`h-8 rounded-md px-3 text-[13px] font-medium ${g.outcome === k ? "bg-background shadow-xs" : "text-zinc-600"}`}>{v}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {adding ? (
        <ActionForm action={addGoal} success="Goal added" onDone={() => setAdding(goals.length === 0)} className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <h2 className="text-[15px] font-semibold">{goals.length ? "New goal" : "Set a goal"}</h2>
          <p className="-mt-2 text-[13px] text-muted-foreground">For this week, month, semester or year. Mark it achieved or dropped when the time comes.</p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="g-title" className="text-sm font-medium">Goal</label>
            <Input id="g-title" name="title" required />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="g-h" className="text-sm font-medium">For</label>
              <NativeSelect id="g-h" name="horizon" defaultValue="month">
                {Object.entries(goalHorizons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="g-s" className="text-sm font-medium">From <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input id="g-s" type="date" name="start" defaultValue={today} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="g-e" className="text-sm font-medium">To <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input id="g-e" type="date" name="end" />
            </div>
          </div>
          <Button type="submit" className="self-start">Add goal</Button>
        </ActionForm>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>Add a goal</Button>
      )}
    </div>
  );
}
