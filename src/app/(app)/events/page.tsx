import type { Metadata } from "next";
import Link from "next/link";
import { Paperclip } from "lucide-react";
import { cn } from "cn";
import { asUser } from "@/server/auth";
import { requireProfile } from "@/server/profile";
import { getEvents, type EventRow } from "@/server/events";
import { formatPartialDate, todayIn } from "@/lib/dates";
import { categories, participation, registration } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/ui";
import { QuickAddButton } from "@/components/app/quick-add";

export const metadata: Metadata = { title: "Events" };

const KINDS = { conference: "Conference / workshop", training: "Training programme", competition: "Competition / hackathon" } as const;

function EventCard({ e, past }: { e: EventRow; past?: boolean }) {
  const facts = [
    ["Organiser", e.organiser],
    ["Venue", e.location],
    ["Role", e.participation === "presented" ? `Presented${e.presentationTitle ? ` — ${e.presentationTitle}` : ""}` : null],
    ["Award", e.award],
    ["Outcome", e.submissionOutcome],
  ].filter((f): f is [string, string] => Boolean(f[1]));
  const badge = past || e.participation !== "unknown"
    ? participation[e.participation as keyof typeof participation]
    : e.registration ? registration[e.registration as keyof typeof registration] : null;
  return (
    <li>
      <Link href={`/journal/${e.id}`} className="flex flex-col gap-2 rounded-xl border bg-card px-5 py-4 transition-colors hover:bg-zinc-50">
        <span className="flex flex-wrap items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-semibold">{e.title}</span>
            <span className="block text-[13px] text-muted-foreground">
              {categories[e.category]} · {e.entryDate ? formatPartialDate(e.entryDate, e.entryPrecision) : "date not set"}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {e.files > 0 && <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Paperclip className="size-3.5" aria-hidden />{e.files}</span>}
            {badge && <Badge variant="outline">{badge}</Badge>}
          </span>
        </span>
        {facts.length > 0 && (
          <dl className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-4 gap-y-1 text-[13px]">
            {facts.map(([k, v]) => (
              <div key={k}><dt className="text-[12px] text-muted-foreground">{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        )}
      </Link>
    </li>
  );
}

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const sp = await searchParams;
  const show = sp.show === "attended" ? "attended" : "upcoming";
  // ("attended" is the Past tab: attended, attendance not recorded yet, and missed)
  const kind = typeof sp.kind === "string" && sp.kind in KINDS ? sp.kind : null;
  const ev = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    return getEvents(tx, todayIn(profile.timezone), kind);
  });
  const qs = (o: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const next = { show: show === "upcoming" ? null : show, kind, ...o };
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/events?${s}` : "/events";
  };
  const tab = (key: "upcoming" | "attended", label: string) => (
    <Link
      href={qs({ show: key === "upcoming" ? null : key })}
      aria-current={show === key ? "page" : undefined}
      className={cn("-mb-px inline-flex h-10 items-center border-b-2 px-0.5 font-medium", show === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5">
      <PageHeader title="Events" subtitle="Conferences, workshops, training and competitions." actions={<QuickAddButton label="Add event" category="conference" variant="default" />} />
      <nav aria-label="Events" data-guide="events-tabs" className="flex gap-5 border-b">
        {tab("upcoming", `Upcoming · ${ev.upcoming.length}`)}
        {tab("attended", `Past · ${ev.attended.length + ev.unrecorded.length + ev.missed.length}`)}
      </nav>
      <div role="group" aria-label="Kind" className="flex flex-wrap gap-2">
        {[[null, "All"] as const, ...Object.entries(KINDS)].map(([k, label]) => (
          <Link key={label} href={qs({ kind: k })} aria-current={kind === k ? "true" : undefined}
            className={cn("inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium", kind === k ? "border-primary bg-primary text-primary-foreground" : "bg-background text-zinc-700 hover:bg-muted")}>
            {label}
          </Link>
        ))}
      </div>

      {show === "upcoming" ? (
        ev.upcoming.length ? (
          <ul className="flex flex-col gap-3">{ev.upcoming.map((e) => <EventCard key={e.id} e={e} />)}</ul>
        ) : (
          <p className="rounded-xl border bg-card px-5 py-8 text-center text-muted-foreground">Nothing coming up. Use Quick Add with the Conference, Training or Competition category to add one.</p>
        )
      ) : (
        <>
          {ev.attended.length ? (
            <ul className="flex flex-col gap-3">{ev.attended.map((e) => <EventCard key={e.id} e={e} past />)}</ul>
          ) : (
            <p className="rounded-xl border bg-card px-5 py-8 text-center text-muted-foreground">Nothing attended yet. After an event, open it and set Participation to Attended or Presented — add the certificate as evidence.</p>
          )}
          {ev.unrecorded.length > 0 && (
            <section className="flex flex-col gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">Over — did you go? · {ev.unrecorded.length}</h2>
                <p className="text-[13px] text-muted-foreground">Open each one and set Participation to Attended, Presented or Did not attend.</p>
              </div>
              <ul className="flex flex-col gap-3">{ev.unrecorded.map((e) => <EventCard key={e.id} e={e} />)}</ul>
            </section>
          )}
          {ev.missed.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-[15px] font-semibold">Didn&apos;t attend or cancelled · {ev.missed.length}</h2>
              <ul className="flex flex-col gap-3">{ev.missed.map((e) => <EventCard key={e.id} e={e} past />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
