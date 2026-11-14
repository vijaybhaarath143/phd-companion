"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Segmented } from "@/components/app/segmented";
import { PartialDateInput } from "@/components/app/partial-date-input";
import { createEntry } from "@/server/actions/entries";
import { createTask } from "@/server/actions/tasks";
import { categories } from "@/lib/labels";
import { isFuture, type PartialDate } from "@/lib/dates";
import type { ProjectOption } from "@/server/profile";

type Mode = "entry" | "task";
type OpenOptions = { mode?: Mode; projectId?: string | null };
type Ctx = { open: (o?: OpenOptions) => void };

const QuickAddContext = createContext<Ctx>({ open: () => {} });
export const useQuickAdd = () => useContext(QuickAddContext);

function useIsDesktop() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return desktop;
}

export function QuickAddProvider({ projects, today, children }: { projects: ProjectOption[]; today: string; children: ReactNode }) {
  const [opts, setOpts] = useState<OpenOptions | null>(null);
  const open = useCallback((o?: OpenOptions) => setOpts(o ?? {}), []);
  const value = useMemo(() => ({ open }), [open]);
  const desktop = useIsDesktop();
  const isOpen = opts !== null;

  const body = isOpen ? (
    <QuickAddForm key={JSON.stringify(opts)} projects={projects} today={today} initial={opts!} onClose={() => setOpts(null)} />
  ) : null;

  return (
    <QuickAddContext value={value}>
      {children}
      {desktop ? (
        <Dialog open={isOpen} onOpenChange={(o) => !o && setOpts(null)}>
          <DialogContent
            className="max-h-[calc(100dvh-4rem)] overflow-y-auto p-0 sm:max-w-[560px]"
            showCloseButton
            onOpenAutoFocus={(e) => {
              // start typing straight into the title
              e.preventDefault();
              document.getElementById("qa-title")?.focus();
            }}
          >
            {body}
          </DialogContent>
        </Dialog>
      ) : (
        <Drawer open={isOpen} onOpenChange={(o) => !o && setOpts(null)}>
          <DrawerContent className="max-h-[92dvh]">
            <div className="overflow-y-auto">{body}</div>
          </DrawerContent>
        </Drawer>
      )}
    </QuickAddContext>
  );
}

const EMPTY_DATE = (today: string): PartialDate => ({ date: today, precision: "day" });

function QuickAddForm({ projects, today, initial, onClose }: { projects: ProjectOption[]; today: string; initial: OpenOptions; onClose: () => void }) {
  const router = useRouter();
  const desktop = useIsDesktop();
  const [mode, setMode] = useState<Mode>(initial.mode ?? "entry");
  const [id, setId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<PartialDate>(EMPTY_DATE(today));
  const [category, setCategory] = useState("");
  const [projectId, setProjectId] = useState(initial.projectId ?? "");
  const [details, setDetails] = useState(false);
  const [notes, setNotes] = useState("");
  const [people, setPeople] = useState("");
  const [planned, setPlanned] = useState(true);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<"normal" | "important">("normal");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const future = mode === "entry" && isFuture(date.date, date.precision, today);
  const Title = desktop ? DialogTitle : DrawerTitle;
  const Description = desktop ? DialogDescription : DrawerDescription;

  function save(another: boolean) {
    setError(null);
    start(async () => {
      const r =
        mode === "entry"
          ? await createEntry({ id, title, date, category: category || null, projectId: projectId || null, notes, people, planned })
          : await createTask({ id, title, dueDate: dueDate || null, priority, projectId: projectId || null, notes });
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      const savedId = id;
      const kind = "kind" in r.data ? r.data.kind : null;
      toast.success(mode === "entry" ? "Entry saved" : "Task saved", {
        action:
          mode === "entry"
            ? { label: "View", onClick: () => router.push(kind === "experiment" ? `/research/experiments/${savedId}` : `/journal/${savedId}`) }
            : { label: "View", onClick: () => router.push("/planner") },
      });
      if (another) {
        setId(crypto.randomUUID());
        setTitle("");
        setNotes("");
        setPeople("");
        setDueDate("");
        // keep date, category and project — handy when backfilling several past entries
        document.getElementById("qa-title")?.focus();
      } else {
        onClose();
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
      className="flex flex-col"
    >
      <div className="px-6 pt-5">
        <Title className="text-lg font-semibold">{mode === "entry" ? "New entry" : "New task"}</Title>
        <Description className="sr-only">Record something that happened, or something to do.</Description>
      </div>

      <div className="flex flex-col gap-5 px-6 pt-4 pb-6">
        <Segmented
          name="mode"
          label="What are you adding?"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: "entry", label: desktop ? "Entry — something that happened" : "Entry" },
            { value: "task", label: desktop ? "Task — something to do" : "Task" },
          ]}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="qa-title" className="text-sm font-medium">Title</label>
          <Input
            id="qa-title"
            autoFocus
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={mode === "entry" ? "e.g. Met guide about SLR 1 figures" : "e.g. Shortlist an appropriate journal"}
            maxLength={300}
          />
        </div>

        {mode === "entry" ? (
          <>
            <PartialDateInput name="qa" label="When did it happen?" today={today} defaultValue={date} onChange={setDate} />
            {future && (
              <label className="-mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={planned} onChange={(e) => setPlanned(e.target.checked)} className="size-4 accent-zinc-900" />
                This is in the future — mark it as planned
              </label>
            )}
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="qa-due" className="text-sm font-medium">Due date <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input id="qa-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Priority</span>
              <Segmented name="priority" label="Priority" value={priority} onChange={setPriority} options={[{ value: "normal", label: "Normal" }, { value: "important", label: "Important" }]} />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {mode === "entry" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="qa-cat" className="text-sm font-medium">Category <span className="font-normal text-muted-foreground">(optional)</span></label>
              <NativeSelect id="qa-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">No category</option>
                {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="qa-project" className="text-sm font-medium">Project <span className="font-normal text-muted-foreground">(optional)</span></label>
            <NativeSelect id="qa-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </NativeSelect>
          </div>
        </div>

        {details ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="qa-notes" className="text-sm font-medium">Notes</label>
              <Textarea id="qa-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder={mode === "entry" ? "What happened, what you decided, what’s next" : "Anything you need to remember for this task"} />
            </div>
            {mode === "entry" && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="qa-people" className="text-sm font-medium">People involved <span className="font-normal text-muted-foreground">(optional)</span></label>
                <Input id="qa-people" value={people} onChange={(e) => setPeople(e.target.value)} placeholder="e.g. your guide" />
              </div>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setDetails(true)} className="-ml-2 flex h-9 w-fit items-center gap-2 rounded-lg px-2 text-sm font-medium hover:bg-muted">
            <Plus className="size-4" aria-hidden /> Add more details
          </button>
        )}

        {error && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
            <span className="flex-1">{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText([title, notes].filter(Boolean).join("\n\n"))}>
              Copy text
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t px-6 py-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button type="button" variant="outline" onClick={() => save(true)} disabled={pending || !title.trim()}>Save &amp; add another</Button>
        <Button type="submit" disabled={pending || !title.trim()}>{pending ? "Saving…" : "Save"}</Button>
      </div>
      <span className="sr-only" aria-live="polite">{pending ? "Saving" : ""}</span>
    </form>
  );
}

export function QuickAddButton({ mode, projectId, label, variant = "outline" }: { mode?: Mode; projectId?: string; label: string; variant?: "outline" | "default" }) {
  const { open } = useQuickAdd();
  return (
    <Button type="button" variant={variant} onClick={() => open({ mode, projectId })}>
      {label}
    </Button>
  );
}
