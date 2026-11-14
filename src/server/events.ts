import "server-only";
import type { Tx } from "@/server/db";
import type { Precision } from "@/lib/dates";

export type EventRow = {
  id: string;
  title: string;
  category: "conference" | "training" | "competition";
  entryDate: string | null;
  entryPrecision: Precision;
  dateTo: string | null;
  status: string | null;
  organiser: string | null;
  location: string | null;
  registration: string | null;
  participation: string;
  presentationTitle: string | null;
  award: string | null;
  submissionOutcome: string | null;
  files: number;
};

/**
 * Conferences, workshops, training and competitions, from the journal entries that already
 * hold them. Upcoming: not over yet (or no date and nothing recorded about going). Attended:
 * attended or presented. Over with attendance not recorded: asked about, never assumed. Missed:
 * did not attend, or cancelled.
 */
export async function getEvents(tx: Tx, today: string, kind: string | null) {
  const rows = await tx<EventRow[]>`
    select e.id, e.title, e.category, e.entry_date, e.entry_precision, e.date_to, e.status,
      ev.organiser, ev.location, ev.registration, coalesce(ev.participation, 'unknown') as participation,
      ev.presentation_title, ev.award, ev.submission_outcome,
      (select count(*)::int from public.attachments a where a.parent_type = 'entry' and a.parent_id = e.id
         and a.removed_at is null and a.replaced_by_id is null and a.status = 'verified') as files
    from public.entries e left join public.events ev on ev.entry_id = e.id
    where e.deleted_at is null and e.archived_at is null
      and e.category in ('conference', 'training', 'competition')
      and (${kind}::text is null or e.category = ${kind})
    order by e.date_from nulls last, e.created_at`;
  const attended = (r: EventRow) => r.participation === "attended" || r.participation === "presented";
  const missed = (r: EventRow) => r.status === "cancelled" || r.participation === "cancelled" || r.participation === "did_not_attend";
  const over = (r: EventRow) => r.dateTo !== null && r.dateTo < today;
  return {
    upcoming: rows.filter((r) => !attended(r) && !missed(r) && !over(r)),
    attended: rows.filter(attended).reverse(),
    // over, but whether she went isn't recorded yet — never assumed either way
    unrecorded: rows.filter((r) => !attended(r) && !missed(r) && over(r)).reverse(),
    missed: rows.filter((r) => !attended(r) && missed(r)).reverse(),
  };
}
