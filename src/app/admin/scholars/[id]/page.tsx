import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { currentAdmin, viewAsScholar } from "@/server/admin";
import type { Tx } from "@/server/db";
import { getProfile } from "@/server/profile";
import { getAreas, getRecentUpdates, getReminders, reviewProgress } from "@/server/home";
import { listGoals, listTasks } from "@/server/planner";
import { listBenchwork, listPublications } from "@/server/research";
import { getAcademics } from "@/server/academics";
import { getEvents, type EventRow } from "@/server/events";
import { getJournal } from "@/server/journal";
import { listNotesFull } from "@/server/notes";
import { formatFullDay, formatPartialDate, formatTimestamp, todayIn } from "@/lib/dates";
import {
  articleTypes,
  categories,
  courseStatuses,
  enquiryStatuses,
  experimentStatuses,
  goalHorizons,
  goalOutcomes,
  milestoneStatuses,
  participation,
  phases,
  taskPriorities,
  taskStatuses,
} from "@/lib/labels";
import { Empty, PageHeader, Row, Rows, Section } from "@/components/app/ui";
import { Badge } from "@/components/ui/badge";
import { ScholarFrame, Text, VIEWS, type View } from "./frame";

export const metadata: Metadata = { title: "Scholar" };

const label = <T extends Record<string, string>>(map: T, key: string | null | undefined) => (key && key in map ? map[key as keyof T] : key ?? "");
const line = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

/** One row of read-only text: a title, a detail line and an optional badge. */
function Item({ title, detail, badge, href }: { title: ReactNode; detail?: ReactNode; badge?: ReactNode; href?: string }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[15px] font-bold break-words">{title}</span>
        {detail && <span className="block text-[13px] break-words text-muted-foreground">{detail}</span>}
      </span>
      {badge}
    </>
  );
  return href ? (
    <li>
      <Link href={href} className="flex min-h-14 items-center gap-3 px-5 py-3 transition-colors hover:bg-zinc-50">{body}</Link>
    </li>
  ) : (
    <Row>{body}</Row>
  );
}

function List({ title, empty, children }: { title: string; empty: string; children: ReactNode[] }) {
  return (
    <Section title={title}>
      {children.length ? <Rows>{children}</Rows> : <p className="px-5 pb-5 text-sm text-muted-foreground">{empty}</p>}
    </Section>
  );
}

async function load(tx: Tx, view: View, id: string) {
  const [who] = await tx<{ email: string }[]>`select current_setting('request.jwt.claims', true)::jsonb ->> 'email' as email`;
  const profile = await getProfile(tx);
  const tz = profile?.timezone ?? "Asia/Kolkata";
  const today = todayIn(tz);
  const base = { email: who?.email ?? "", profile, tz, today };
  switch (view) {
    case "overview":
      return { ...base, view, reminders: await getReminders(tx, today), updates: await getRecentUpdates(tx, today, tz, 10), areas: await getAreas(tx) };
    case "planner":
      return { ...base, view, open: await listTasks(tx, "open", 300, today), done: await listTasks(tx, "done", 20), goals: await listGoals(tx) };
    case "research": {
      const publications = await listPublications(tx);
      return { ...base, view, publications, steps: await reviewProgress(tx, publications.map((p) => p.manuscriptId)), benchwork: await listBenchwork(tx) };
    }
    case "academics":
      return { ...base, view, academics: await getAcademics(tx) };
    case "events":
      return { ...base, view, events: await getEvents(tx, today, null) };
    case "journal":
      return { ...base, view, journal: await getJournal(tx, { limit: 200 }), entryHref: (e: string) => `/admin/scholars/${id}/entries/${e}` };
    case "notes":
      return { ...base, view, notes: await listNotesFull(tx, 200) };
  }
}

export default async function ScholarWorkPage({ params, searchParams }: PageProps<"/admin/scholars/[id]">) {
  const admin = await currentAdmin();
  if (!admin) notFound();
  const { id } = await params;
  const sp = await searchParams;
  const view: View = typeof sp.view === "string" && sp.view in VIEWS ? (sp.view as View) : "overview";

  const data = await viewAsScholar(admin, id, (tx) => load(tx, view, id));
  if (!data) notFound();
  const name = data.profile?.displayName || data.email;
  const p = data.profile;

  return (
    <ScholarFrame id={id} name={name} current={view}>
      <PageHeader
        eyebrow="Scholar"
        title={name}
        subtitle={p?.onboardedAt ? line(p.phdTitle, p.university, p.department, p.guideName && `Guide: ${p.guideName}`) || data.email : "They haven't set up their PhD space yet."}
      />

      {data.view === "overview" && (
        <>
          <Section title="Their areas" padded>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {data.areas.map((a) => (
                <div key={a.key} className="rounded-xl border-2 bg-background px-3.5 py-3">
                  <div className="font-display text-[22px] leading-7 font-black">{a.count}</div>
                  <div className="text-[13px] text-muted-foreground">{a.label}</div>
                </div>
              ))}
            </div>
          </Section>
          {(
            [
              ["Overdue", data.reminders.overdue],
              ["Today", data.reminders.today],
              ["Next 7 days", data.reminders.week],
              ["Later", data.reminders.later],
              ["No date yet", data.reminders.undated],
            ] as const
          )
            .filter(([, items]) => items.length)
            .map(([title, items]) => (
              <List key={title} title={`${title} (${items.length})`} empty="">
                {items.map((r) => (
                  <Item
                    key={r.key}
                    title={r.title}
                    detail={r.detail}
                    badge={r.overdue ? <Badge variant="overdue">Overdue</Badge> : r.waiting ? <Badge variant="info">Waiting</Badge> : r.priority === "high" ? <Badge variant="attention">High</Badge> : undefined}
                  />
                ))}
              </List>
            ))}
          {Object.values(data.reminders).every((g) => g.length === 0) && (
            <Section padded className="pt-5"><Empty>Nothing due or open right now.</Empty></Section>
          )}
          <List title="Recent updates" empty="Nothing recorded yet.">
            {data.updates.map((u) => <Item key={u.key} title={u.title} detail={u.detail} />)}
          </List>
        </>
      )}

      {data.view === "planner" && (
        <>
          <List title={`Open tasks (${data.open.length})`} empty="No open tasks.">
            {data.open.map((t) => (
              <Item
                key={t.id}
                title={t.title}
                detail={line(
                  t.manuscriptTitle ?? t.courseName,
                  t.dueDate && `${t.dueDate < data.today ? "was due" : "due"} ${formatFullDay(t.dueDate)}`,
                  t.status === "waiting" && `waiting${t.waitingOnTitle ? ` on “${t.waitingOnTitle}”` : ""}${t.waitingReason ? ` — ${t.waitingReason}` : ""}`,
                  t.notes,
                )}
                badge={
                  t.dueDate && t.dueDate < data.today && t.status !== "waiting" ? (
                    <Badge variant="overdue">Overdue</Badge>
                  ) : (
                    <Badge variant={t.priority === "high" ? "attention" : "outline"}>{label(taskStatuses, t.status)} · {label(taskPriorities, t.priority)}</Badge>
                  )
                }
              />
            ))}
          </List>
          <List title="Goals" empty="No goals set.">
            {data.goals.map((g) => (
              <Item
                key={g.id}
                title={g.title}
                detail={line(label(goalHorizons, g.horizon), g.periodStart && g.periodEnd && `${formatFullDay(g.periodStart)} – ${formatFullDay(g.periodEnd)}`)}
                badge={<Badge variant={g.outcome === "achieved" ? "success" : "outline"}>{label(goalOutcomes, g.outcome)}</Badge>}
              />
            ))}
          </List>
          <List title="Recently done" empty="Nothing finished yet.">
            {data.done.map((t) => (
              <Item key={t.id} title={t.title} detail={line(t.manuscriptTitle ?? t.courseName, t.completedAt && `finished ${formatTimestamp(t.completedAt, data.tz)}`)} badge={<Badge variant="muted">{label(taskStatuses, t.status)}</Badge>} />
            ))}
          </List>
        </>
      )}

      {data.view === "research" && (
        <>
          <List title="Publications" empty="No publications yet.">
            {data.publications.map((m) => {
              const s = data.steps.get(m.manuscriptId);
              return (
                <Item
                  key={m.key}
                  title={m.title}
                  detail={line(
                    articleTypes[m.articleType],
                    s && s.total ? `review steps ${s.done}/${s.total}${s.current ? ` — on “${s.current}”` : ""}` : null,
                    m.openFeedback ? `${m.openFeedback} open feedback` : null,
                    m.waiting ? `${m.waiting} waiting` : null,
                  )}
                  badge={m.currentPhase ? <Badge variant="grape">{label(phases, m.currentPhase)}</Badge> : undefined}
                />
              );
            })}
          </List>
          <List title="Benchwork" empty="No experiments yet.">
            {data.benchwork.map((x) => (
              <Item
                key={x.id}
                href={`/admin/scholars/${id}/entries/${x.id}`}
                title={x.title}
                detail={line(formatPartialDate(x.entryDate, x.entryPrecision), `${x.trials} ${x.trials === 1 ? "trial" : "trials"}`, x.openBlockers ? `${x.openBlockers} open ${x.openBlockers === 1 ? "blocker" : "blockers"}` : null)}
                badge={x.status ? <Badge variant={x.openBlockers ? "attention" : "outline"}>{label(experimentStatuses, x.status)}</Badge> : undefined}
              />
            ))}
          </List>
        </>
      )}

      {data.view === "academics" && (
        <>
          {data.academics.credits && (
            <Section title={data.academics.credits.label} padded>
              <p className="text-[15px]">
                {data.academics.credits.summary.recognised} credits recognised
                {data.academics.credits.summary.required !== null ? ` of ${data.academics.credits.summary.required} required` : ""}
                {data.academics.credits.period ? ` · ${data.academics.credits.period}` : ""}
              </p>
            </Section>
          )}
          <List title="Courses" empty="No courses yet.">
            {data.academics.courses.map((c) => (
              <Item key={c.id} title={c.name} detail={line(c.provider, c.credits !== null && `${c.credits} credits`, c.completedOn && `completed ${formatFullDay(c.completedOn)}`)} badge={<Badge variant={c.status === "completed" ? "success" : "outline"}>{label(courseStatuses, c.status)}</Badge>} />
            ))}
          </List>
          <List title="Course deadlines" empty="No assignments or exams.">
            {data.academics.courseItems.map((i) => (
              <Item
                key={i.id}
                title={i.title}
                detail={line(data.academics.courses.find((c) => c.id === i.courseId)?.name, i.kind === "exam_registration" ? "exam registration" : i.kind, i.dueDate && `due ${formatFullDay(i.dueDate)}`, i.note)}
                badge={i.doneAt ? <Badge variant="success">Done</Badge> : i.dueDate && i.dueDate < data.today ? <Badge variant="overdue">Overdue</Badge> : undefined}
              />
            ))}
          </List>
          <List title="Milestones" empty="No milestones.">
            {data.academics.milestones.map((m) => (
              <Item key={m.id} title={m.title} detail={m.status === "done" ? `done ${formatPartialDate(m.doneOn, m.donePrecision)}` : m.targetDate ? `target ${formatPartialDate(m.targetDate, m.targetPrecision)}` : undefined} badge={<Badge variant={m.status === "done" ? "success" : "outline"}>{label(milestoneStatuses, m.status)}</Badge>} />
            ))}
          </List>
          <List title="Enquiries" empty="No enquiries.">
            {data.academics.enquiries.map((q) => (
              <Item key={q.entryId} href={`/admin/scholars/${id}/entries/${q.entryId}`} title={q.title} detail={line(q.office, q.contact, q.followUpDate && `follow up ${formatFullDay(q.followUpDate)}`, q.response)} badge={<Badge variant={q.status === "closed" ? "muted" : "info"}>{label(enquiryStatuses, q.status)}</Badge>} />
            ))}
          </List>
        </>
      )}

      {data.view === "events" &&
        (
          [
            ["Coming up", data.events.upcoming],
            ["Over, attendance not recorded", data.events.unrecorded],
            ["Attended", data.events.attended],
            ["Missed", data.events.missed],
          ] as [string, EventRow[]][]
        ).map(([title, rows]) => (
          <List key={title} title={title} empty="None.">
            {rows.map((e) => (
              <Item
                key={e.id}
                href={`/admin/scholars/${id}/entries/${e.id}`}
                title={e.title}
                detail={line(formatPartialDate(e.entryDate, e.entryPrecision), label(categories, e.category), e.organiser, e.location, e.presentationTitle && `presenting “${e.presentationTitle}”`, e.award && `award: ${e.award}`)}
                badge={<Badge variant="outline">{label(participation, e.participation)}</Badge>}
              />
            ))}
          </List>
        ))}

      {data.view === "journal" && (
        <>
          <List title={`Entries (${data.journal.dated.length}${data.journal.hasOlder ? "+" : ""})`} empty="No dated entries yet.">
            {data.journal.dated.map((e) => (
              <Item key={e.id} href={data.entryHref(e.id)} title={e.title} detail={line(formatPartialDate(e.entryDate, e.entryPrecision), label(categories, e.category), e.manuscriptTitle, e.excerpt)} />
            ))}
          </List>
          {data.journal.undated.length > 0 && (
            <List title="No date yet" empty="">
              {data.journal.undated.map((e) => (
                <Item key={e.id} href={data.entryHref(e.id)} title={e.title} detail={line(label(categories, e.category), e.manuscriptTitle, e.excerpt)} />
              ))}
            </List>
          )}
          {data.journal.hasOlder && <p className="text-sm text-muted-foreground">Showing the latest {data.journal.limit} entries.</p>}
        </>
      )}

      {data.view === "notes" &&
        (data.notes.length === 0 ? (
          <Section padded className="pt-5"><Empty>No notes yet.</Empty></Section>
        ) : (
          data.notes.map((n) => (
            <Section key={n.id} title={n.title || "Untitled"} action={<span className="text-[13px] text-muted-foreground">{n.pinned ? "Pinned · " : ""}Updated {formatTimestamp(n.updatedAt, data.tz)}</span>} padded>
              {n.kind === "checklist" ? (
                <ul className="flex flex-col gap-1.5">
                  {n.items.map((i) => (
                    <li key={i.id} className="flex items-start gap-2 text-[15px]">
                      <span aria-hidden>{i.done ? "☑" : "☐"}</span>
                      <span className={i.done ? "text-muted-foreground line-through" : undefined}>{i.text}</span>
                      <span className="sr-only">{i.done ? "(done)" : "(not done)"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text label="Note">{n.body || "Empty"}</Text>
              )}
            </Section>
          ))
        ))}
    </ScholarFrame>
  );
}
