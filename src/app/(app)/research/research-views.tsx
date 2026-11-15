import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Empty, Section } from "@/components/app/ui";
import { PhaseBar, StepBar } from "@/components/app/step-bar";
import { formatFullDay, formatPartialDate, type Precision } from "@/lib/dates";
import { experimentStatuses, phases } from "@/lib/labels";
import type { PublicationRow } from "@/server/research";
import type { StepProgress } from "@/server/home";
import { NewExperiment, NewPublication } from "./research-create";


function PublicationItem({ p, steps }: { p: PublicationRow; steps?: StepProgress }) {
  const href = `/research/manuscripts/${p.manuscriptId}`;
  const detail = [
    p.articleType === "review" && steps ? (steps.current ? `Step ${steps.currentNo} of ${steps.total} · ${steps.current}` : `All ${steps.total} steps done`) : null,
    p.currentPhase ? `Manuscript: ${phases[p.currentPhase]}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={href} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-zinc-50">
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-bold">{p.title}</span>
          <span className="block text-[13px] text-muted-foreground">{detail}</span>
          {p.articleType === "review" && steps ? <StepBar done={steps.done} total={steps.total} currentNo={steps.currentNo} className="mt-2" /> : p.currentPhase && p.currentPhase !== "stopped" ? <PhaseBar phase={p.currentPhase} className="mt-2" /> : null}
        </span>
        {p.openFeedback > 0 && <Badge variant="attention">Feedback to address</Badge>}
        {p.openFeedback === 0 && p.waiting > 0 && <Badge variant="attention">Guide feedback pending</Badge>}
        {p.currentPhase === "stopped" && <Badge variant="muted">Stopped</Badge>}
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

export function PublicationsView({ rows, steps }: { rows: PublicationRow[]; steps: Map<string, StepProgress> }) {
  // (steps are keyed by publication)
  const reviews = rows.filter((r) => r.articleType === "review");
  const originals = rows.filter((r) => r.articleType === "original");
  return (
    <div className="flex flex-col gap-4">
      <Section title={`Review articles · ${reviews.length}`} action={<NewPublication articleType="review" />}>
        {reviews.length ? (
          <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">{reviews.map((p) => <PublicationItem key={p.key} p={p} steps={steps.get(p.manuscriptId)} />)}</ul>
        ) : (
          <Empty>No review articles yet. A systematic or narrative review gets step-by-step progress and PRISMA numbers.</Empty>
        )}
      </Section>
      <Section title={`Original articles · ${originals.length}`} action={<NewPublication articleType="original" />}>
        {originals.length ? (
          <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">{originals.map((p) => <PublicationItem key={p.key} p={p} />)}</ul>
        ) : (
          <Empty>No original articles yet. Progress follows the manuscript phases.</Empty>
        )}
      </Section>
    </div>
  );
}

export function BenchworkView({ rows }: { rows: { id: string; title: string; status: string | null; entryDate: string | null; entryPrecision: Precision; trials: number; lastTrial: string | null; openBlockers: number }[] }) {
  return (
    <Section title={`Experiments · ${rows.length}`} action={<NewExperiment />}>
      {rows.length ? (
        <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
          {rows.map((x) => (
            <li key={x.id}>
              <Link href={`/research/experiments/${x.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-zinc-50">
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[15px] font-bold">{x.title}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {[
                      formatPartialDate(x.entryDate, x.entryPrecision),
                      x.trials ? `${x.trials} trial${x.trials > 1 ? "s" : ""}${x.lastTrial ? `, last ${formatFullDay(x.lastTrial)}` : ""}` : "no trials yet",
                    ].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {x.openBlockers > 0 && <Badge variant="attention">Blocked</Badge>}
                <Badge variant="success">{x.status ? experimentStatuses[x.status as keyof typeof experimentStatuses] : "Status not set"}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>No experiments yet. Add one here, or record a Laboratory experiment with Quick Add.</Empty>
      )}
    </Section>
  );
}
