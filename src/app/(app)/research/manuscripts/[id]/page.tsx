import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, CalendarDays } from "lucide-react";
import { asUser } from "@/server/auth";
import { getManuscriptBundle, prismaNumbers } from "@/server/research";
import { requireProfile } from "@/server/profile";
import { formatPartialDate, formatTimestamp, todayIn } from "@/lib/dates";
import { categories } from "@/lib/labels";
import { isUuid } from "@/lib/utils";
import { Empty, IconLink, RowLink, Rows, Section } from "@/components/app/ui";
import { Evidence } from "@/components/app/evidence";
import { ManuscriptView } from "./manuscript-view";
import { ReviewSteps } from "./review-steps";
import { PublicationTasks } from "./publication-tasks";

export const metadata: Metadata = { title: "Publication" };

export default async function ManuscriptPage({ params }: PageProps<"/research/manuscripts/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    return { bundle: await getManuscriptBundle(tx, id), today: todayIn(profile.timezone), tz: profile.timezone };
  });
  if (!data.bundle) notFound();
  const { history, submissionHistory, tasks, entries, steps, evidence, ...bundle } = data.bundle;
  const isReview = bundle.manuscript.articleType === "review";
  // "recorded on" dates are shown on her own clock, formatted here so the page reads the same before and after it loads
  return (
    <ManuscriptView
      {...bundle}
      history={history.map((h) => ({ ...h, recordedLabel: formatTimestamp(h.recordedAt, data.tz) }))}
      submissionHistory={submissionHistory.map((s) => ({ ...s, recordedLabel: formatTimestamp(s.recordedAt, data.tz, { time: true }) }))}
      today={data.today}
    >
      {(steps.length > 0 || isReview) && <ReviewSteps manuscriptId={id} steps={steps} prisma={prismaNumbers(steps)} />}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-4">
          <Section guide="publication-tasks" title="Open tasks" action={<IconLink href="/planner" label="All tasks in Planner"><CalendarDays /></IconLink>}>
            {tasks.length === 0 && <Empty>No open tasks for this publication.</Empty>}
            <PublicationTasks manuscriptId={id} tasks={tasks} />
          </Section>
          <Section title="Recent entries" action={<IconLink href={`/journal?publication=${id}`} label="All entries in Journal"><BookOpen /></IconLink>}>
            {entries.length ? (
              <Rows>
                {entries.map((e) => (
                  <RowLink key={e.id} href={`/journal/${e.id}`} title={e.title}
                    detail={[formatPartialDate(e.entryDate, e.entryPrecision), e.category ? categories[e.category as keyof typeof categories] : null].filter(Boolean).join(" · ")} />
                ))}
              </Rows>
            ) : (
              <Empty>Nothing recorded for this publication yet. Tag a journal entry with it to see it here.</Empty>
            )}
          </Section>
        </div>
        <section data-guide="evidence" className="flex min-w-0 flex-[2_1_280px] flex-col gap-3 rounded-2xl border-2 bg-card px-5 py-4 shadow-edge">
          <h2 className="text-lg">Files and links</h2>
          <Evidence items={evidence} parentType="manuscript" parentId={id} hint="Drafts, figures, or a link to a shared folder." />
        </section>
      </div>
    </ManuscriptView>
  );
}
