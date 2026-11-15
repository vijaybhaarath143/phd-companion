import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Search } from "lucide-react";
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

function EntryRow({ e, partial }: { e: JournalRow; partial: boolean }) {
  const href = e.kind === "experiment" ? `/research/experiments/${e.id}` : `/journal/${e.id}`;
  const b = badgeFor(e);
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-4 px-5 py-3 hover:bg-zinc-50">
        <span className="w-14 shrink-0 text-[13px] text-zinc-600 tabular-nums">{e.entryPrecision === "day" && e.entryDate ? formatDay(e.entryDate) : "—"}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-bold">{e.title}</span>
          <span className="block text-[13px] text-muted-foreground">
            {meta(e) || " "}
            {partial && <span className="ml-1 text-attention-foreground">· only partly inside the dates you picked</span>}
          </span>
        </span>
        {b && <Badge variant={b.variant}>{b.label}</Badge>}
      </Link>
    </li>
  );
}

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  // anything invalid in the address (a bad publication id, month 13…) is simply ignored
  const filters = cleanJournalFilters({ q: pick("q"), category: pick("category"), status: pick("status"), publication: pick("publication"), from: pick("from"), to: pick("to"), limit: Number(pick("limit")) || undefined });
  const filtering = [filters.q, filters.category, filters.status, filters.publication, filters.from, filters.to].some(Boolean);

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
    <div className="mx-auto flex max-w-[860px] flex-col gap-5">
      <PageHeader eyebrow="Journal" title="Everything you've recorded" subtitle="Newest first. Meetings, readings, experiments, events — anything that happened." actions={<QuickAddButton mode="entry" label="New entry" variant="default" />} />

      <form className="flex flex-col gap-2.5" role="search" data-guide="journal-search">
        <label className="flex h-11 items-center gap-2 rounded-xl border-2 bg-card px-3.5 focus-within:ring-4 focus-within:ring-sky-soft">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={filters.q}
            autoFocus={sp.search === "1"}
            aria-label="Search the journal"
            placeholder="Search titles, notes, people, observations, journals…"
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <AppSelect name="category" defaultValue={filters.category ?? ""} aria-label="Category" size="sm" className="w-auto" options={toOptions(categories, "Any category")} />
          <AppSelect name="status" defaultValue={filters.status ?? ""} aria-label="Status" size="sm" className="w-auto" options={toOptions(entryStatuses, "Any status")} />
          {filters.publication && <input type="hidden" name="publication" value={filters.publication} />}
          <MonthFilter key={`from-${filters.from ?? ""}`} name="from" label="From" edge="start" defaultValue={filters.from} today={today} />
          <MonthFilter key={`to-${filters.to ?? ""}`} name="to" label="to" edge="end" defaultValue={filters.to} today={today} />
          <Button type="submit" size="sm">Apply</Button>
          {filtering && <Button asChild size="sm" variant="ghost"><Link href="/journal">Clear</Link></Button>}
        </div>
        {filters.publication && (
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <Badge variant="success">About: {publications.find((p) => p.id === filters.publication)?.title ?? "a publication"}</Badge>
            <Link href="/journal" className="font-display font-extrabold text-sky hover:underline">Show everything</Link>
          </p>
        )}
      </form>

      {journal.otherMatches.length > 0 && (
        <section className="rounded-2xl border-2 bg-card shadow-edge px-5 py-4">
          <h2 className="text-[15px] font-extrabold">Also matching</h2>
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
          <CalendarDays className="size-[18px] shrink-0" aria-hidden />
          <span className="flex-1"><b>{journal.undated.length} {journal.undated.length === 1 ? "entry needs" : "entries need"} a date.</b> They&apos;re kept below the timeline until you add a day or a month.</span>
          <span className="font-medium">Review</span>
        </a>
      )}

      {groups.size === 0 && journal.undated.length === 0 && (
        <p data-guide="journal-timeline" className="rounded-2xl border-2 bg-card shadow-edge px-5 py-8 text-center text-muted-foreground">
          {!filtering ? "Nothing recorded yet. Use New entry to record your first one." : journal.otherMatches.length ? "No journal entries match — see the other matches above." : "Nothing matches. Try fewer filters or other words."}
        </p>
      )}

      {[...groups.entries()].map(([k, g]) => (
        <section key={k} data-guide="journal-timeline" className="rounded-2xl border-2 bg-card shadow-edge">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-[15px] font-extrabold">{monthLabel(k)}</h2>
            {k > thisMonth && <Badge variant="info">Planned</Badge>}
          </div>
          {g.exact.length > 0 && (
            <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
              {g.exact.map((e) => <EntryRow key={e.id} e={e} partial={journal.partial.has(e.id)} />)}
            </ul>
          )}
          {g.month.length > 0 && (
            <>
              <p className="px-5 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Day not known</p>
              <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
                {g.month.map((e) => <EntryRow key={e.id} e={e} partial={journal.partial.has(e.id)} />)}
              </ul>
            </>
          )}
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
            <h2 className="text-[15px] font-extrabold">Needs a date</h2>
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
