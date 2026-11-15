"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ListChecks, Pin, PinOff, Plus, StickyNote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/app/app-select";
import { SaveStatus, useAutosave } from "@/components/app/autosave";
import { quickAction, trashWithUndo } from "@/components/app/call-action";
import { useRouter } from "next/navigation";
import { rowOptions } from "@/lib/options";
import { createNote, saveNote, trashNote, type NotePatch } from "@/server/actions/notes";
import { undoTrash } from "@/server/actions/settings";
import type { Note, NoteItem } from "@/server/notes";
import type { ProjectOption } from "@/server/profile";

export function NewNoteButtons() {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => { await quickAction(() => createNote("checklist")); })}>
        <ListChecks aria-hidden /> New checklist
      </Button>
      <Button type="button" disabled={pending} onClick={() => start(async () => { await quickAction(() => createNote("scratch")); })}>
        <StickyNote aria-hidden /> New note
      </Button>
    </div>
  );
}

const newId = () => crypto.randomUUID().slice(0, 8);

export function NoteEditor({ note, projects }: { note: Note; projects: ProjectOption[] }) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body ?? "");
  const [items, setItems] = useState<NoteItem[]>(note.items);
  const [projectId, setProjectId] = useState(note.projectId ?? "");
  const [pinned, setPinned] = useState(note.pinned);
  const [draft, setDraft] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const auto = useAutosave<NotePatch>(note.version, (version, patch) => saveNote(note.id, version, patch), (a, b) => ({ ...a, ...b }));

  const setList = (next: NoteItem[], delay?: number) => {
    setItems(next);
    auto.schedule({ items: next }, delay);
  };
  const addItem = () => {
    const text = draft.trim();
    if (!text) return;
    setList([...items, { id: newId(), text, done: false }], 0);
    setDraft("");
  };
  const copyText = () => [title, body, ...items.map((i) => `${i.done ? "[x]" : "[ ]"} ${i.text}`)].filter(Boolean).join("\n");
  const done = items.filter((i) => i.done).length;

  return (
    <section className="flex min-h-[520px] flex-col gap-4 rounded-2xl border-2 bg-card shadow-edge px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SaveStatus state={auto.state} message={auto.message} onRetry={() => void auto.retry()} copyText={copyText} />
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="note-project">Project</label>
          <AppSelect id="note-project" size="sm" className="w-44" value={projectId} onValueChange={(v) => { setProjectId(v); auto.schedule({ projectId: v || null }, 0); }} options={rowOptions(projects, (p) => p.title.split(":")[0], "No project")} />
          <Button type="button" size="sm" variant="outline" aria-pressed={pinned} onClick={() => { setPinned(!pinned); auto.schedule({ pinned: !pinned }, 0); }}>
            {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />} {pinned ? "Unpin" : "Pin"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => start(async () => {
              if (!(await auto.flush())) return void toast.error("Your latest changes haven't saved yet — copy your text or try again first.");
              await trashWithUndo({ what: "Note", trash: () => trashNote(note.id), undo: () => undoTrash("notes", note.id), onUndone: () => router.push(`/notes?id=${note.id}`) });
            })}
          >
            Move to Trash
          </Button>
        </div>
      </div>

      <label className="sr-only" htmlFor="note-title">Title</label>
      <input
        id="note-title"
        value={title}
        maxLength={300}
        onChange={(e) => { setTitle(e.target.value); auto.schedule({ title: e.target.value }); }}
        className="w-full bg-transparent text-xl font-semibold tracking-[-0.01em] outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card placeholder:text-muted-foreground"
        placeholder="Title"
      />

      {note.kind === "checklist" ? (
        <div className="flex flex-col gap-1">
          <p className="text-[13px] text-muted-foreground">{done} of {items.length} ticked</p>
          <ul className="flex flex-col divide-y-2 divide-zinc-100 border-y border-zinc-100">
            {items.map((it, i) => (
              <li key={it.id} className="group flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  className="size-[18px] shrink-0 accent-primary"
                  aria-label={`Done: ${it.text || "item"}`}
                  checked={it.done}
                  onChange={(e) => setList(items.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)), 0)}
                />
                <label className="sr-only" htmlFor={`item-${it.id}`}>Item {i + 1}</label>
                <input
                  id={`item-${it.id}`}
                  value={it.text}
                  maxLength={1000}
                  onChange={(e) => setList(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                  className={`min-w-0 flex-1 bg-transparent outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card ${it.done ? "text-muted-foreground line-through" : ""}`}
                />
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${it.text || "item"}`} className="opacity-60 group-hover:opacity-100" onClick={() => setList(items.filter((_, j) => j !== i), 0)}>
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          <form className="flex items-center gap-3 py-2" onSubmit={(e) => { e.preventDefault(); addItem(); }}>
            <Plus className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
            <label className="sr-only" htmlFor="new-item">Add an item</label>
            <input id="new-item" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add an item and press Enter" maxLength={1000} className="min-w-0 flex-1 bg-transparent outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card placeholder:text-muted-foreground" />
          </form>
          <label className="sr-only" htmlFor="note-body">Notes under the list</label>
          <textarea id="note-body" value={body} onChange={(e) => { setBody(e.target.value); auto.schedule({ body: e.target.value }); }} rows={3} placeholder="Notes (optional)" className="mt-1 w-full resize-y bg-transparent text-[14px] outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card placeholder:text-muted-foreground" />
        </div>
      ) : (
        <>
          <label className="sr-only" htmlFor="note-body">Note</label>
          <textarea
            id="note-body"
            value={body}
            onChange={(e) => { setBody(e.target.value); auto.schedule({ body: e.target.value }); }}
            placeholder="Type anything — half-formed ideas, a search string to try, a number to remember…"
            className="min-h-[420px] w-full flex-1 resize-y bg-transparent text-[15px] leading-7 outline-none rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card placeholder:text-muted-foreground"
          />
        </>
      )}
      <p className="text-[12px] text-muted-foreground">Only you can see your notes. They&apos;re included in search and in your export.</p>
    </section>
  );
}
