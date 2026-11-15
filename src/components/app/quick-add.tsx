"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Paperclip, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AppSelect } from "@/components/app/app-select";
import { toOptions, rowOptions } from "@/lib/options";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { Segmented } from "@/components/app/segmented";
import { PRIORITY_OPTIONS } from "@/components/app/priority";
import type { TaskPriority } from "@/lib/labels";
import { PartialDateInput } from "@/components/app/partial-date-input";
import { createEntry } from "@/server/actions/entries";
import { createTask } from "@/server/actions/tasks";
import { categories } from "@/lib/labels";
import { ACCEPT, ALLOWED_DESCRIPTION, formatBytes } from "@/lib/files";
import { fileProblem, uploadEvidence } from "@/lib/upload";
import { isFuture, type PartialDate } from "@/lib/dates";
import { callAction, copyToClipboard } from "@/components/app/call-action";
import type { PublicationOption } from "@/server/profile";

type Mode = "entry" | "task";
type OpenOptions = { mode?: Mode; manuscriptId?: string | null; category?: string };
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

export function QuickAddProvider({ publications, today, children }: { publications: PublicationOption[]; today: string; children: ReactNode }) {
  const [opts, setOpts] = useState<OpenOptions | null>(null);
  // Has she typed something that isn't saved yet? Then closing asks first.
  const [dirty, setDirty] = useState(false);
  const open = useCallback((o?: OpenOptions) => setOpts(o ?? {}), []);
  const value = useMemo(() => ({ open }), [open]);
  const desktop = useIsDesktop();
  const isOpen = opts !== null;

  const close = useCallback(() => {
    setOpts(null);
    setDirty(false);
  }, []);
  /** Esc, a click outside, a swipe down or Cancel: never throw away a draft without asking. */
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("Discard this draft? What you typed hasn't been saved.")) return;
    close();
  }, [dirty, close]);

  const body = isOpen ? (
    <QuickAddForm key={JSON.stringify(opts)} publications={publications} today={today} initial={opts!} onCancel={requestClose} onSaved={close} onDirtyChange={setDirty} />
  ) : null;

  return (
    <QuickAddContext value={value}>
      {children}
      {desktop ? (
        <Dialog open={isOpen} onOpenChange={(o) => !o && requestClose()}>
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
        // With a draft, swiping down or tapping outside doesn't close the sheet; Cancel asks first.
        <Drawer open={isOpen} dismissible={!dirty} onOpenChange={(o) => !o && requestClose()}>
          <DrawerContent className="max-h-[92dvh]">
            <div className="overflow-y-auto">{body}</div>
          </DrawerContent>
        </Drawer>
      )}
    </QuickAddContext>
  );
}

const EMPTY_DATE = (today: string): PartialDate => ({ date: today, precision: "day" });

function QuickAddForm({
  publications,
  today,
  initial,
  onCancel,
  onSaved,
  onDirtyChange,
}: {
  publications: PublicationOption[];
  today: string;
  initial: OpenOptions;
  onCancel: () => void;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const desktop = useIsDesktop();
  const [mode, setMode] = useState<Mode>(initial.mode ?? "entry");
  const [id, setId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<PartialDate>(EMPTY_DATE(today));
  const [category, setCategory] = useState(initial.category ?? "");
  const [manuscriptId, setManuscriptId] = useState(initial.manuscriptId ?? "");
  const [details, setDetails] = useState(false);
  const [notes, setNotes] = useState("");
  const [people, setPeople] = useState("");
  const [planned, setPlanned] = useState(true);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [remind, setRemind] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty = Boolean(title.trim() || notes.trim() || people.trim() || files.length);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function pickFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const problems = picked.map(fileProblem).filter((p): p is string => Boolean(p));
    if (problems.length) toast.error(problems.join(" "));
    setFiles((prev) => [...prev, ...picked.filter((f) => !fileProblem(f))]);
    if (fileInput.current) fileInput.current.value = "";
  }

  const future = mode === "entry" && isFuture(date.date, date.precision, today);
  const Title = desktop ? DialogTitle : DrawerTitle;
  const Description = desktop ? DialogDescription : DrawerDescription;

  function save(another: boolean) {
    setError(null);
    start(async () => {
      // A dropped connection comes back as a message here — the draft stays in the form.
      // (The record's id is chosen here, so retrying can't create it twice.)
      const r = await callAction(() =>
        mode === "entry"
          ? createEntry({ id, title, date, category: category || null, manuscriptId: manuscriptId || null, notes, people, planned })
          : createTask({ id, title, dueDate: dueDate || null, priority, manuscriptId: manuscriptId || null, notes, remindUntilDone: remind }),
      );
      if (!r) return;
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      const savedId = id;
      const kind = "kind" in r.data ? r.data.kind : null;
      // Files go in once the entry exists; a failed file never loses the entry itself.
      let added = 0;
      if (mode === "entry") {
        for (const [i, file] of files.entries()) {
          setUploading(files.length > 1 ? `Uploading ${i + 1} of ${files.length}: ${file.name}…` : `Uploading ${file.name}…`);
          let problem: string | null;
          try {
            problem = await uploadEvidence("entry", savedId, file);
          } catch {
            problem = `Couldn't upload ${file.name} — check your connection.`;
          }
          if (problem) toast.error(`${problem} The entry was saved — open it to try the file again.`);
          else added++;
        }
        setUploading(null);
      }
      const saved = mode === "task" ? "Task saved" : added === 0 ? "Saved to your Journal" : `Saved to your Journal with ${added === 1 ? "1 file" : `${added} files`}`;
      toast.success(saved, {
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
        setRemind(false);
        setFiles([]);
        // keep date, category and publication — handy when backfilling several past entries
        document.getElementById("qa-title")?.focus();
      } else {
        onSaved();
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
        <Title className="text-xl font-extrabold">{mode === "entry" ? "New journal entry" : "New task"}</Title>
        <Description className="text-[13px] text-muted-foreground">{mode === "entry" ? "Something that happened — a meeting, a reading, an experiment, an event." : "Something you need to do."}</Description>
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
            { value: "entry", label: "Journal" },
            { value: "task", label: "Task" },
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
                <input type="checkbox" checked={planned} onChange={(e) => setPlanned(e.target.checked)} className="size-4 accent-primary" />
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
              <Segmented name="priority" label="Priority" value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 px-3 py-2.5 sm:col-span-2 has-checked:bg-zinc-50">
              <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="mt-0.5 size-[18px] shrink-0 accent-primary" />
              <span className="flex flex-col">
                <span className="text-sm font-medium">Keep reminding me until it&apos;s done</span>
                <span className="text-[13px] text-muted-foreground">Shows a reminder at the top of every page until you tick it off.</span>
              </span>
            </label>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {mode === "entry" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="qa-cat" className="text-sm font-medium">Category <span className="font-normal text-muted-foreground">(optional)</span></label>
              <AppSelect id="qa-cat" value={category} onValueChange={setCategory} options={toOptions(categories, "No category")} />
            </div>
          )}
          {publications.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="qa-publication" className="text-sm font-medium">Publication <span className="font-normal text-muted-foreground">(optional)</span></label>
              <AppSelect id="qa-publication" value={manuscriptId} onValueChange={setManuscriptId} options={rowOptions(publications, (p) => p.title, "Not about a publication")} />
            </div>
          )}
        </div>

        {mode === "entry" && (
          <div className="flex flex-col gap-2">
            {files.length > 0 && (
              <ul className="flex flex-col gap-1">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex min-h-9 items-center gap-2 text-sm">
                    <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 truncate">{f.name}</span>
                    <span className="shrink-0 text-[12px] text-muted-foreground">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      aria-label={`Don't attach ${f.name}`}
                      disabled={pending}
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="ml-auto rounded p-1.5 text-muted-foreground hover:bg-muted"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input ref={fileInput} type="file" accept={ACCEPT} multiple className="sr-only" id="qa-files" tabIndex={-1} onChange={(e) => pickFiles(e.target.files)} />
            <span className="text-sm font-medium">Files <span className="font-normal text-muted-foreground">(optional)</span></span>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => fileInput.current?.click()} className="w-fit">
              <Paperclip aria-hidden /> {files.length ? "Attach more files" : "Attach files"}
            </Button>
            <p className="text-[12px] text-muted-foreground">{ALLOWED_DESCRIPTION}. Files are private to you.</p>
          </div>
        )}

        {details || mode === "entry" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="qa-notes" className="text-sm font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span></label>
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
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-overdue px-3 py-2 text-[13px] text-overdue-foreground">
            <span className="flex-1">{error}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => copyToClipboard([title, notes, people].filter(Boolean).join("\n\n"))}>
              Copy text
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t px-6 py-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="button" variant="outline" onClick={() => save(true)} disabled={pending || !title.trim()}>Save &amp; add another</Button>
        <Button type="submit" disabled={pending || !title.trim()}>{uploading ? "Uploading…" : pending ? "Saving…" : "Save"}</Button>
      </div>
      {uploading && <p role="status" className="px-6 pb-4 text-right text-[13px] text-muted-foreground">{uploading}</p>}
      <span className="sr-only" aria-live="polite">{uploading ?? (pending ? "Saving" : "")}</span>
    </form>
  );
}

export function QuickAddButton({ mode, manuscriptId, category, label, variant = "outline" }: { mode?: Mode; manuscriptId?: string; category?: string; label: string; variant?: "outline" | "default" }) {
  const { open } = useQuickAdd();
  return (
    <Button type="button" variant={variant} onClick={() => open({ mode, manuscriptId, category })}>
      <Plus strokeWidth={2.8} aria-hidden /> {label}
    </Button>
  );
}
