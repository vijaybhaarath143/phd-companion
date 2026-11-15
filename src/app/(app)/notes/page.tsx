import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks, Pin, StickyNote } from "lucide-react";
import { cn } from "cn";
import { asUser } from "@/server/auth";
import { requireProfile, projectOptions } from "@/server/profile";
import { getNote, listNotes } from "@/server/notes";
import { formatTimestamp } from "@/lib/dates";
import { PageHeader } from "@/components/app/ui";
import { NewNoteButtons, NoteEditor } from "./note-editor";

export const metadata: Metadata = { title: "Notes" };

export default async function NotesPage({ searchParams }: PageProps<"/notes">) {
  const sp = await searchParams;
  const data = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    const notes = await listNotes(tx);
    const id = typeof sp.id === "string" ? sp.id : notes[0]?.id;
    return { tz: profile.timezone, notes, note: id ? await getNote(tx, id) : null, projects: await projectOptions(tx) };
  });

  return (
    <div className="mx-auto flex max-w-[1060px] flex-col gap-5">
      <PageHeader title="Notes" subtitle="Scribbles and checklists — saved as you type." actions={<NewNoteButtons />} />
      {data.notes.length === 0 ? (
        <section className="flex flex-col items-center gap-3 rounded-2xl border-2 bg-card shadow-edge px-6 py-12 text-center">
          <h2 className="text-lg font-extrabold">No notes yet</h2>
          <p className="max-w-[460px] text-muted-foreground">A note is a blank page for half-formed ideas. A checklist is for things to tick off — like the journals you&apos;ve shortlisted.</p>
          <NewNoteButtons />
        </section>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <nav aria-label="Your notes" data-guide="notes-list" className="min-w-0 flex-[1_1_240px] rounded-2xl border-2 bg-card shadow-edge p-1.5">
            <ul className="flex flex-col gap-0.5">
              {data.notes.map((n) => {
                const Icon = n.kind === "checklist" ? ListChecks : StickyNote;
                const on = data.note?.id === n.id;
                return (
                  <li key={n.id}>
                    <Link href={`/notes?id=${n.id}`} aria-current={on ? "page" : undefined} className={cn("flex flex-col rounded-lg px-3 py-2.5", on ? "bg-muted" : "hover:bg-zinc-50")}>
                      <span className="flex items-center gap-2 font-medium">
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{n.title}</span>
                        {n.pinned && <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-label="Pinned" />}
                      </span>
                      <span className="ml-5.5 text-[12px] text-muted-foreground">
                        {[n.kind === "checklist" ? `${n.itemsDone} of ${n.itemsTotal} ticked` : "Note", n.projectTitle?.split(":")[0], formatTimestamp(n.updatedAt, data.tz)].filter(Boolean).join(" · ")}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="min-w-0 flex-[3_1_480px]">
            {data.note ? (
              <NoteEditor key={data.note.id} note={data.note} projects={data.projects} />
            ) : (
              <p className="rounded-2xl border-2 bg-card shadow-edge px-5 py-8 text-center text-muted-foreground">That note wasn&apos;t found — it may be in Trash.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
