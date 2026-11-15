import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Paperclip, Search } from "lucide-react";
import { asUser } from "@/server/auth";
import { cleanJournalFilters, getJournal, type JournalRow } from "@/server/journal";
import { MonthFilter } from "@/components/app/month-filter";
import { publicationOptions, requireProfile } from "@/server/profile";
import { formatDay, monthKey, monthLabel, todayIn } from "@/lib/dates";
import { categories, entryStatuses, participation, registration, experimentStatuses } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppSelect } from "@/components/app/app-select";
import { toOptions } from "@/lib/options";
import { PageHeader } from "@/components/app/ui";
import { QuickAddButton } from "@/components/app/quick-add";

export const metadata: Metadata = { title: "Journal" };

function badgeFor(e: JournalRow) {
  if (e.registration || (e.participation && e.participation !== "unknown")) {
    const parts = [e.registration ? registration[e.registration as keyof typeof registration] : null,
      e.participation && e.participation !== "unknown" ? participation[e.participation as keyof typeof participation].toLowerCase() : null].filter(Boolean);
    return { label: parts.join(" · ").replace(/^./, (c) => c.toUpperCase()), variant: "clay" as const };
  }
  if (e.experimentStatus) return { label: experimentStatuses[e.experimentStatus as keyof typeof experimentStatuses], variant: "success" as const };
  if (e.status === "planned" || e.status === "cancelled" || e.status === "postponed") return { label: entryStatuses[e.status], variant: e.status === "planned" ? ("info" as const) : ("muted" as const) };
  return null;
}

function meta(e: JournalRow) {
  return [e.category ? categories[e.category as keyof typeof categories] : null, e.manuscriptTitle ? e.manuscriptTitle.split(":")[0] : null, e.award].filter(Boolean).join(" · ");
}

/** Each kind of entry keeps one colour: Leaf experiment, Sky meeting, Sun feedback, Clay event, Grape decision. */
const KIND: Record<string, { label: string; dot: string; badge: "success" | "info" | "attention" | "clay" | "grape" | "muted" }> = {
  experiment: { label: "Experiment", dot: "bg-primary ring-leaf-soft", badge: "success" },
  meeting: { label: "Meeting", dot: "bg-sky ring-sky-soft", badge: "info" },
  feedback: { label: "Feedback", dot: "bg-[#c98a00] ring-attention", badge: "attention" },
  event: { label: "Event", dot: "bg-clay ring-clay-soft", badge: "clay" },
  decision: { label: "Decision", dot: "bg-grape ring-grape-soft", badge: "grape" },
  enquiry: { label: "Enquiry", dot: "bg-zinc-400 ring-zinc-100", badge: "muted" },
  note: { label: "Note", dot: "bg-zinc-400 ring-zinc-100", badge: "muted" },
};
const kindOf = (k: string) => KIND[k] ?? KIND.note;

const CHIPS: { kind: string | null; label: string }[] = [
  { kind: null, label: "All" },
  { kind: "experiment", label: "Experiments" },
  { kind: "meeting", label: "Meetings" },
  { kind: "feedback", label: "Feedback" },
  { kind: "event", label: "Events" },
  { kind: "decision", label: "Decisions" },
  { kind: "note", label: "Notes" },
];

function EntryCard({ e, partial }: { e: JournalRow; partial: boolean }) {
  const href = e.kind === "experiment" ? `/research/experiments/${e.id}` : `/journal/${e.id}`;
  const b = badgeFor(e);
  const k = kindOf(e.kind);
  const context = meta(e);
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 sm:gap-x-4">
      <span aria-hidden className="relative flex justify-center">
        <span className="absolute inset-y-0 w-1 rounded-full bg-zinc-200" />
        <span className={`relative mt-6 size-4 rounded-full ring-[5px] ${k.dot}`} />
      </span>
      <Link href={href} className="my-1.5 flex flex-col gap-2 rounded-2xl border-2 bg-card px-5 py-4 shadow-edge transition-colors hover:bg-zinc-50">
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant={k.badge}>{k.label}</Badge>
          {b && <Badge variant={b.variant}>{b.label}</Badge>}
          {context && <span className="text-[13px] text-muted-foreground">{context}</span>}
          <span className="ml-auto text-[13px] text-zinc-600 tabular-nums">{e.entryPrecision === "day" && e.entryDate ? formatDay(e.entryDate) : "Day not known"}</span>
        </span>
        <span className="font-display text-[18px] leading-snug font-black">{e.title}</span>
        {e.excerpt && <span className="line-clamp-2 text-[15px] leading-relaxed text-zinc-700">{e.excerpt}</span>}
        {(e.files > 0 || partial) && (
          <span className="flex flex-wrap gap-x-4 text-[13px] text-muted-foreground">
            {e.files > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="size-3.5" aria-hidden />{e.files} {e.files === 1 ? "file" : "files"}</span>}
            {partial && <span className="text-attention-foreground">Only partly inside the dates you picked</span>}
          </span>
        )}
      </Link>
    </li>
  );
}

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  // anything invalid in the address (a bad publication id, month 13…) is simply ignored
  const filters = cleanJournalFilters({ q: pick("q"), kind: pick("kind"), category: pick("category"), status: pick("status"), publication: pick("publication"), from: pick("from"), to: pick("to"), limit: Number(pick("limit")) || undefined });
  const filtering = [filters.q, filters.kind, filters.category, filters.status, filters.publication, filters.from, filters.to].some(Boolean);

  const { journal, publications, today } = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    return { journal: await getJournal(tx, filters), publications: await publicationOptions(tx), today: todayIn(profile.timezone) };
  });

  // group by month; within a month exact days first, then "Day not known"
  const groups = new Map<string, { exact: JournalRow[]; month: JournalRow[] }>();
  for (const e of journal.dated) {
    const k = monthKey(e.dateFrom!);
    if (!groups.has(k)) groups.set(k, { exact: [], month: [] });
    groups.get(k)![e.entryPrecision === "day" ? "exact" : "month"].push(e);
  }
  const thisMonth = monthKey(today);

  return (
    <div className="mx-auto flex max-w-[920px] flex-col gap-6">
      <PageHeader eyebrow="Journal" title="Everything you've recorded" subtitle="Newest first. Meetings, readings, experiments, events — anything that happened." actions={<QuickAddButton mode="entry" label="New entry" variant="default" />} />

      <form className="flex flex-col gap-2.5" role="search" data-guide="journal-search">
        <label className="flex h-14 items-center gap-3 rounded-2xl border-2 bg-card px-4 focus-within:ring-4 focus-within:ring-sky-soft">
          <Search className="size-5 text-muted-foreground" aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            autoFocus={sp.search === "1"}
            aria-label="Search the journal"
            placeholder="Search titles, notes, people, observations, journals…"
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
        </label>
        {filters.kind && <input type="hidden" name="kind" value={filters.kind} />}
        <nav aria-label="Kind of entry" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {CHIPS.map((c) => {
            const on = (filters.kind ?? null) === c.kind;
            const qs = new URLSearchParams(Object.entries({ ...filters, kind: c.kind ?? undefined, limit: undefined }).filter((e): e is [string, string] => typeof e[1] === "string" && e[1] !== ""));
            return (
              <Link key={c.label} href={`/journal${qs.size ? `?${qs}` : ""}`} aria-current={on ? "page" : undefined}
                className={`flex h-10 shrink-0 items-center gap-2 rounded-full border-2 px-4 font-display text-sm font-extrabold transition-colors ${on ? "border-sky-soft bg-sky-soft text-sky-strong" : "bg-card text-zinc-600 hover:text-foreground"}`}>
                {c.kind && <span aria-hidden className={`size-2.5 rounded-full ${kindOf(c.kind).dot.split(" ")[0]}`} />}
                {c.label}
              </Link>
            );
          })}
        </nav>
        <details open={Boolean(filters.category || filters.status || filters.from || filters.to)} className="group/more">
          <summary className="w-fit cursor-pointer list-none rounded-lg font-display text-sm font-extrabold text-sky hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open/more:hidden">More filters</span>
            <span className="hidden group-open/more:inline">Fewer filters</span>
          </summary>
        <div className="mt-2.5 flex flex-wrap items-end gap-2">
          <AppSelect name="category" defaultValue={filters.category ?? ""} aria-label="Category" size="sm" className="w-auto" options={toOptions(categories, "Any category")} />
          <AppSelect name="status" defaultValue={filters.status ?? ""} aria-label="Status" size="sm" className="w-auto" options={toOptions(entryStatuses, "Any status")} />
          {filters.publication && <input type="hidden" name="publication" value={filters.publication} />}
          <MonthFilter key={`from-${filters.from ?? ""}`} name="from" label="From" edge="start" defaultValue={filters.from} today={today} />
          <MonthFilter key={`to-${filters.to ?? ""}`} name="to" label="to" edge="end" defaultValue={filters.to} today={today} />
          <Button type="submit" size="sm">Apply</Button>
          {filtering && <Button asChild size="sm" variant="ghost"><Link href="/journal">Clear</Link></Button>}
        </div>
        </details>
        {filters.publication && (
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <Badge variant="success">About: {publications.find((p) => p.id === filters.publication)?.title ?? "a publication"}</Badge>
            <Link href="/journal" className="font-display font-extrabold text-sky hover:underline">Show everything</Link>
          </p>
        )}
      </form>

      {journal.otherMatches.length > 0 && (
        <section className="rounded-2xl border-2 bg-card shadow-edge px-5 py-4">
          <h2 className="text-[18px]">Also matching</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {journal.otherMatches.map((m, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="w-36 shrink-0 text-[13px] text-muted-foreground">{m.kind}</span>
                <Link href={m.href} className="underline-offset-4 hover:underline">{m.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!filtering && journal.undated.length > 0 && (
        <a href="#needs-date" className="flex items-center gap-3 rounded-2xl bg-attention px-5 py-3.5 text-attention-foreground">
          <CalendarDays className="size-5 shrink-0" aria-hidden />
          <span className="flex-1 font-display font-bold">{journal.undated.length} {journal.undated.length === 1 ? "entry needs" : "entries need"} a date. Add one whenever you remember.</span>
          <span className="font-display font-black">Review</span>
        </a>
      )}

      {groups.size === 0 && journal.undated.length === 0 && (
        <p data-guide="journal-timeline" className="rounded-2xl border-2 bg-card shadow-edge px-5 py-8 text-center text-muted-foreground">
          {!filtering ? "Nothing recorded yet. Use New entry to record your first one." : journal.otherMatches.length ? "No journal entries match — see the other matches above." : "Nothing matches. Try fewer filters or other words."}
        </p>
      )}

      {[...groups.entries()].map(([k, g]) => (
        <section key={k} data-guide="journal-timeline" aria-label={monthLabel(k)} className="flex flex-col">
          <div className="mb-1 flex items-center gap-2.5 pl-[2.5rem] sm:pl-[2.75rem]">
            <h2 className="font-display text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">{monthLabel(k)}</h2>
            {k === thisMonth && <Badge variant="success">This month</Badge>}
            {k > thisMonth && <Badge variant="info">Planned</Badge>}
          </div>
          <ol>
            {[...g.exact, ...g.month].map((e) => <EntryCard key={e.id} e={e} partial={journal.partial.has(e.id)} />)}
          </ol>
        </section>
      ))}

      {journal.hasOlder && (
        <Link
          href={`/journal?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([k, v]) => v && k !== "limit")), limit: String(journal.limit + 200) } as Record<string, string>).toString()}`}
          scroll={false}
          className="self-center rounded-xl border-2 bg-card px-4 py-2 font-display text-sm font-extrabold shadow-edge transition-transform duration-75 hover:bg-zinc-50 active:translate-y-1 active:shadow-none"
        >
          Show older entries
        </Link>
      )}

      {journal.undated.length > 0 && (
        <section id="needs-date" data-guide="journal-undated" className="scroll-mt-6 rounded-2xl border-2 bg-card shadow-edge">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-2">
            <h2 className="text-[20px]">Needs a date</h2>
            <span className="text-[13px] text-muted-foreground">{journal.undated.length} · searchable and exported, but not on the timeline</span>
          </div>
          <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
            {journal.undated.map((e) => (
              <li key={e.id}>
                <Link href={e.kind === "experiment" ? `/research/experiments/${e.id}?date=1` : `/journal/${e.id}?date=1`} className="flex min-h-14 items-center gap-4 px-5 py-3 hover:bg-zinc-50">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{e.title}</span>
                    <span className="block text-[13px] text-muted-foreground">{meta(e) || " "}</span>
                  </span>
                  <span className="rounded-xl border-2 bg-card px-3 py-1.5 font-display text-[13px] font-extrabold">Add date</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
