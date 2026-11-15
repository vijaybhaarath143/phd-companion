import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Empty, Section } from "@/components/app/ui";
import { StepBar } from "@/components/app/step-bar";
import { formatFullDay, formatPartialDate, type Precision } from "@/lib/dates";
import { experimentStatuses, phases, type Phase } from "@/lib/labels";
import type { PublicationRow } from "@/server/research";
import type { StepProgress } from "@/server/home";

const PHASE_ORDER: Phase[] = ["planning", "research", "writing", "review", "choosing_journal", "under_review", "revising", "accepted", "published"];

function PhaseBar({ phase }: { phase: Phase }) {
  const at = PHASE_ORDER.indexOf(phase);
  return <StepBar done={Math.max(at, 0)} total={PHASE_ORDER.length} currentNo={at >= 0 && phase !== "published" ? at + 1 : null} className="mt-2" />;
}

function PublicationItem({ p, steps }: { p: PublicationRow; steps?: StepProgress }) {
  const href = p.manuscriptId ? `/research/manuscripts/${p.manuscriptId}` : `/research/projects/${p.projectId}#progress`;
  const detail = [
    p.articleType === "review" && steps ? (steps.current ? `Step ${steps.currentNo} of ${steps.total} · ${steps.current}` : `All ${steps.total} steps done`) : null,
    p.currentPhase ? `Manuscript: ${phases[p.currentPhase]}` : "No manuscript yet",
    p.projectTitle && p.projectTitle !== p.title ? p.projectTitle.split(":")[0] : null,
  ].filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={href} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-zinc-50">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{p.title}</span>
          <span className="block text-[13px] text-muted-foreground">{detail}</span>
          {p.articleType === "review" && steps ? <StepBar done={steps.done} total={steps.total} currentNo={steps.currentNo} className="mt-2" /> : p.currentPhase && p.currentPhase !== "stopped" ? <PhaseBar phase={p.currentPhase} /> : null}
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
  const reviews = rows.filter((r) => r.articleType === "review");
  const originals = rows.filter((r) => r.articleType === "original");
  return (
    <div className="flex flex-col gap-4">
      <Section title={`Review articles · ${reviews.length}`} action={<span className="text-[12px] text-muted-foreground">Progress follows the review steps</span>}>
        {reviews.length ? (
          <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">{reviews.map((p) => <PublicationItem key={p.key} p={p} steps={p.projectId ? steps.get(p.projectId) : undefined} />)}</ul>
        ) : (
          <Empty>No review articles yet. A systematic or narrative review project shows up here.</Empty>
        )}
      </Section>
      <Section title={`Original articles · ${originals.length}`} action={<span className="text-[12px] text-muted-foreground">Progress follows the manuscript phases</span>}>
        {originals.length ? (
          <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">{originals.map((p) => <PublicationItem key={p.key} p={p} />)}</ul>
        ) : (
          <Empty>No original articles yet. Add a manuscript to a project, or switch a manuscript&apos;s article type on its page.</Empty>
        )}
      </Section>
    </div>
  );
}

export function BenchworkView({ rows }: { rows: { id: string; title: string; status: string | null; projectTitle: string | null; entryDate: string | null; entryPrecision: Precision; trials: number; lastTrial: string | null; openBlockers: number }[] }) {
  return (
    <Section title={`Experiments · ${rows.length}`}>
      {rows.length ? (
        <ul className="divide-y-2 divide-zinc-100 border-t-2 border-zinc-100">
          {rows.map((x) => (
            <li key={x.id}>
              <Link href={`/research/experiments/${x.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-zinc-50">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{x.title}</span>
                  <span className="block text-[13px] text-muted-foreground">
                    {[
                      x.projectTitle ? x.projectTitle.split(":")[0] : null,
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
        <Empty>No experiments yet. Add one from a project, or record a Laboratory experiment with Quick Add.</Empty>
      )}
    </Section>
  );
}
