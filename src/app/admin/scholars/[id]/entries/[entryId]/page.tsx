import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentAdmin, viewAsScholar } from "@/server/admin";
import { getProfile } from "@/server/profile";
import { getEntry } from "@/server/journal";
import { getExperimentBundle, getTrials } from "@/server/research";
import type { EvidenceItem } from "@/server/evidence";
import { formatFullDay, formatPartialDate, formatTimestamp } from "@/lib/dates";
import { blockerCategories, categories, entryStatuses, enquiryStatuses, experimentStatuses, participation, registration, taskStatuses } from "@/lib/labels";
import { PageHeader, Row, Rows, Section } from "@/components/app/ui";
import { Badge } from "@/components/ui/badge";
import { ScholarFrame, Text } from "../../frame";

export const metadata: Metadata = { title: "Entry" };

const label = <T extends Record<string, string>>(map: T, key: string | null | undefined) => (key && key in map ? map[key as keyof T] : key ?? "");

/** Files are listed by name only: they're stored under the scholar's account and open only for them. */
function Evidence({ items }: { items: EvidenceItem[] }) {
  if (!items.length) return null;
  return (
    <Section title="Files and links">
      <Rows>
        {items.map((f) => (
          <Row key={f.id}>
            {f.kind === "link" && f.url ? (
              <a href={f.url} target="_blank" rel="noopener noreferrer nofollow" className="min-w-0 flex-1 font-display text-[15px] font-bold break-words text-sky hover:underline">{f.label || f.url}</a>
            ) : (
              <span className="min-w-0 flex-1 font-display text-[15px] font-bold break-words">{f.label || f.filename}</span>
            )}
            <Badge variant="outline">{f.kind === "link" ? "Link" : "File"}</Badge>
          </Row>
        ))}
      </Rows>
    </Section>
  );
}

export default async function ScholarEntryPage({ params }: PageProps<"/admin/scholars/[id]/entries/[entryId]">) {
  const admin = await currentAdmin();
  if (!admin) notFound();
  const { id, entryId } = await params;

  const data = await viewAsScholar(admin, id, async (tx) => {
    const [who] = await tx<{ email: string }[]>`select current_setting('request.jwt.claims', true)::jsonb ->> 'email' as email`;
    const profile = await getProfile(tx);
    const entry = await getEntry(tx, entryId);
    if (!entry) return { who: who?.email ?? "", profile, entry: null };
    const experiment = entry.hasExperiment ? await getExperimentBundle(tx, entryId) : null;
    const trials = entry.hasExperiment ? await getTrials(tx, entryId) : [];
    return { who: who?.email ?? "", profile, entry, experiment, trials };
  });
  if (!data?.entry) notFound();
  const { entry } = data;
  const name = data.profile?.displayName || data.who;
  const tz = data.profile?.timezone ?? "Asia/Kolkata";
  const x = data.experiment?.experiment;

  return (
    <ScholarFrame id={id} name={name} back={{ href: `/admin/scholars/${id}?view=${entry.hasExperiment ? "research" : "journal"}`, label: `Back to ${name}` }}>
      <PageHeader
        eyebrow={[label(categories, entry.category) || "Journal entry", formatPartialDate(entry.entryDate, entry.entryPrecision)].join(" · ")}
        title={entry.title}
        subtitle={`Added ${formatTimestamp(entry.createdAt, tz)} · last changed ${formatTimestamp(entry.updatedAt, tz)}`}
        actions={entry.status ? <Badge variant="outline">{label(entryStatuses, entry.status)}</Badge> : undefined}
      />

      <Section padded className="pt-5">
        <div className="flex flex-col gap-4">
          <Text label="What happened">{entry.description}</Text>
          <Text label="People">{entry.people}</Text>
          <Text label="Outcome">{entry.outcome}</Text>
          <Text label="Skills learned">{entry.skillsLearned}</Text>
          {!entry.description && !entry.people && !entry.outcome && !entry.skillsLearned && <p className="text-sm text-muted-foreground">No description written.</p>}
        </div>
      </Section>

      {x && (
        <Section title="Experiment" action={x.status ? <Badge variant="outline">{label(experimentStatuses, x.status)}</Badge> : undefined} padded>
          <div className="flex flex-col gap-4">
            <Text label="Objective">{x.objective}</Text>
            <Text label="Materials">{x.materials}</Text>
            <Text label="Procedure">{x.procedure}</Text>
            <Text label="Observations">{x.observations}</Text>
            <Text label="Interpretation">{x.interpretation}</Text>
            <Text label="Outcome">{x.outcome}</Text>
            <Text label="Next steps">{x.nextSteps}</Text>
            {![x.objective, x.materials, x.procedure, x.observations, x.interpretation, x.outcome, x.nextSteps].some(Boolean) && <p className="text-sm text-muted-foreground">Nothing written yet.</p>}
          </div>
        </Section>
      )}

      {data.experiment && data.experiment.blockers.length > 0 && (
        <Section title="Blockers">
          <Rows>
            {data.experiment.blockers.map((b) => (
              <Row key={b.id}>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[15px] font-bold break-words">{b.description}</span>
                  <span className="block text-[13px] text-muted-foreground">{label(blockerCategories, b.category)} · since {formatFullDay(b.openedOn)}{b.resolvedOn ? ` · resolved ${formatFullDay(b.resolvedOn)}` : ""}</span>
                </span>
                <Badge variant={b.resolvedOn ? "success" : "attention"}>{b.resolvedOn ? "Resolved" : "Open"}</Badge>
              </Row>
            ))}
          </Rows>
        </Section>
      )}

      {data.trials && data.trials.length > 0 && (
        <Section title="Trials">
          <Rows>
            {data.trials.map((t) => (
              <Row key={t.id} className="flex-col items-stretch gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex-1 font-display text-[15px] font-bold">Trial {t.trialNo}{t.runOn ? ` · ${formatFullDay(t.runOn)}` : ""}</span>
                  {t.outcome && <Badge variant={t.outcome === "worked" ? "success" : t.outcome === "did_not_work" ? "overdue" : "outline"}>{t.outcome === "worked" ? "Worked" : t.outcome === "did_not_work" ? "Didn't work" : "Inconclusive"}</Badge>}
                </div>
                <Text label="Conditions">{t.conditions}</Text>
                <Text label="Result">{t.result}</Text>
                {t.evidence.length > 0 && <p className="text-[13px] text-muted-foreground">Files: {t.evidence.map((f) => f.label || f.filename || f.url).join(", ")}</p>}
              </Row>
            ))}
          </Rows>
        </Section>
      )}

      {entry.event && (
        <Section title="Event" padded>
          <div className="flex flex-col gap-4">
            <Text label="Organiser">{entry.event.organiser}</Text>
            <Text label="Location">{entry.event.location}</Text>
            <Text label="Registration">{entry.event.registration ? label(registration, entry.event.registration) : null}</Text>
            <Text label="Attendance">{label(participation, entry.event.participation)}</Text>
            <Text label="Presentation">{entry.event.presentationTitle}</Text>
            <Text label="Award">{entry.event.award}</Text>
            <Text label="Submission outcome">{entry.event.submissionOutcome}</Text>
          </div>
        </Section>
      )}

      {entry.feedback && (
        <Section title="Feedback" action={<Badge variant={entry.feedback.resolutionStatus === "open" ? "attention" : "outline"}>{entry.feedback.resolutionStatus}</Badge>} padded>
          <div className="flex flex-col gap-4">
            <Text label="From">{entry.feedback.source}</Text>
            <Text label="Received via">{entry.feedback.receivedVia}</Text>
            <Text label="Changes asked for">{entry.feedback.requestedChanges}</Text>
            <Text label="What was done">{entry.feedback.resolutionNote}</Text>
          </div>
        </Section>
      )}

      {entry.enquiry && (
        <Section title="Enquiry" action={<Badge variant="info">{label(enquiryStatuses, entry.enquiry.status)}</Badge>} padded>
          <div className="flex flex-col gap-4">
            <Text label="Office">{entry.enquiry.office}</Text>
            <Text label="Contact">{entry.enquiry.contact}</Text>
            <Text label="Response">{entry.enquiry.response}</Text>
            <Text label="Follow up">{entry.enquiry.followUpDate ? formatFullDay(entry.enquiry.followUpDate) : null}</Text>
          </div>
        </Section>
      )}

      {entry.tasks.length > 0 && (
        <Section title="Tasks from this entry">
          <Rows>
            {entry.tasks.map((t) => (
              <Row key={t.id}>
                <span className="min-w-0 flex-1 font-display text-[15px] font-bold break-words">{t.title}</span>
                <Badge variant="outline">{label(taskStatuses, t.status)}</Badge>
              </Row>
            ))}
          </Rows>
        </Section>
      )}

      <Evidence items={entry.evidence} />
    </ScholarFrame>
  );
}
