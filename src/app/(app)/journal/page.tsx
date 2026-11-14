import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Search } from "lucide-react";
import { asUser } from "@/server/auth";
import { getJournal, type JournalRow } from "@/server/journal";
import { projectOptions, requireProfile } from "@/server/profile";
import { formatDay, monthKey, monthLabel, todayIn } from "@/lib/dates";
import { categories, entryStatuses, participation, registration, experimentStatuses } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/app/ui";

export const metadata: Metadata = { title: "Journal" };

function badgeFor(e: JournalRow) {
  if (e.registration || (e.participation && e.participation !== "unknown")) {
    const parts = [e.registration ? registration[e.registration as keyof typeof registration] : null,
      e.participation && e.participation !== "unknown" ? participation[e.participation as keyof typeof participation].toLowerCase() : null].filter(Boolean);
    return parts.join(" · ").replace(/^./, (c) => c.toUpperCase());
  }
  if (e.experimentStatus) return experimentStatuses[e.experimentStatus as keyof typeof experimentStatuses];
  if (e.status === "planned" || e.status === "cancelled" || e.status === "postponed") return entryStatuses[e.status];
  return null;
}

function meta(e: JournalRow) {
  return [e.category ? categories[e.category as keyof typeof categories] : null, e.projectTitle ? e.projectTitle.split(":")[0] : null, e.award].filter(Boolean).join(" · ");
}

function EntryRow({ e, partial }: { e: JournalRow; partial: boolean }) {
  const href = e.kind === "experiment" ? `/research/experiments/${e.id}` : `/journal/${e.id}`;
  const b = badgeFor(e);
  return (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-4 px-5 py-3 hover:bg-zinc-50">
        <span className="w-14 shrink-0 text-[13px] text-zinc-600 tabular-nums">{e.entryPrecision === "day" && e.entryDate ? formatDay(e.entryDate) : "—"}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{e.title}</span>
          <span className="block text-[13px] text-muted-foreground">
            {meta(e) || " "}
            {partial && <span className="ml-1 text-attention-foreground">· only partly inside the dates you picked</span>}
          </span>
        </span>
        {b && <Badge variant="outline">{b}</Badge>}
      </Link>
    </li>
  );
}

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" && sp[k] ? (sp[k] as string) : undefined);
  const filters = { q: pick("q"), category: pick("category"), status: pick("status"), project: pick("project"), from: pick("from"), to: pick("to") };
  const filtering = Object.values(filters).some(Boolean);

  const { journal, projects, today } = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    return { journal: await getJournal(tx, filters), projects: await projectOptions(tx), today: todayIn(profile.timezone) };
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
      <PageHeader title="Journal" subtitle="Everything you've recorded, newest first." />

      <form className="flex flex-col gap-2.5" role="search">
        <label className="flex h-11 items-center gap-2 rounded-lg border bg-background px-3.5 focus-within:ring-3 focus-within:ring-ring/50">
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
          <NativeSelect name="category" defaultValue={filters.category ?? ""} aria-label="Category" className="h-9 w-auto">
            <option value="">Any category</option>
            {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
          <NativeSelect name="status" defaultValue={filters.status ?? ""} aria-label="Status" className="h-9 w-auto">
            <option value="">Any status</option>
            {Object.entries(entryStatuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
          <NativeSelect name="project" defaultValue={filters.project ?? ""} aria-label="Project" className="h-9 w-auto max-w-56">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title.split(":")[0]}</option>)}
          </NativeSelect>
          <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            From <Input type="month" name="from" defaultValue={filters.from} className="h-9 w-40" />
          </label>
          <label className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            to <Input type="month" name="to" defaultValue={filters.to} className="h-9 w-40" />
          </label>
          <Button type="submit" size="sm">Apply</Button>
          {filtering && <Button asChild size="sm" variant="ghost"><Link href="/journal">Clear</Link></Button>}
        </div>
      </form>

      {journal.otherMatches.length > 0 && (
        <section className="rounded-xl border bg-card px-5 py-4">
          <h2 className="text-[15px] font-semibold">Also matching</h2>
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
        <a href="#needs-date" className="flex items-center gap-3 rounded-xl border border-attention-border bg-attention px-5 py-3.5 text-attention-foreground">
          <CalendarDays className="size-[18px] shrink-0" aria-hidden />
          <span className="flex-1"><b>{journal.undated.length} {journal.undated.length === 1 ? "entry needs" : "entries need"} a date.</b> They&apos;re kept below the timeline until you add a day or a month.</span>
          <span className="font-medium">Review</span>
        </a>
      )}

      {groups.size === 0 && journal.undated.length === 0 && (
        <p className="rounded-xl border bg-card px-5 py-8 text-center text-muted-foreground">
          {!filtering ? "Nothing recorded yet. Use Quick Add to record your first entry." : journal.otherMatches.length ? "No journal entries match — see the other matches above." : "Nothing matches. Try fewer filters or other words."}
        </p>
      )}

      {[...groups.entries()].map(([k, g]) => (
        <section key={k} className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-[15px] font-semibold">{monthLabel(k)}</h2>
            {k > thisMonth && <Badge variant="outline">Planned</Badge>}
          </div>
          {g.exact.length > 0 && (
            <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
              {g.exact.map((e) => <EntryRow key={e.id} e={e} partial={journal.partial.has(e.id)} />)}
            </ul>
          )}
          {g.month.length > 0 && (
            <>
              <p className="px-5 pt-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Day not known</p>
              <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
                {g.month.map((e) => <EntryRow key={e.id} e={e} partial={journal.partial.has(e.id)} />)}
              </ul>
            </>
          )}
        </section>
      ))}

      {journal.undated.length > 0 && (
        <section id="needs-date" className="scroll-mt-6 rounded-xl border bg-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4 pb-2">
            <h2 className="text-[15px] font-semibold">Needs a date</h2>
            <span className="text-[13px] text-muted-foreground">{journal.undated.length} · searchable and exported, but not on the timeline</span>
          </div>
          <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
            {journal.undated.map((e) => (
              <li key={e.id}>
                <Link href={e.kind === "experiment" ? `/research/experiments/${e.id}` : `/journal/${e.id}`} className="flex min-h-14 items-center gap-4 px-5 py-3 hover:bg-zinc-50">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{e.title}</span>
                    <span className="block text-[13px] text-muted-foreground">{meta(e) || " "}</span>
                  </span>
                  <span className="rounded-lg border px-3 py-1.5 text-[13px] font-medium">Add date</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
