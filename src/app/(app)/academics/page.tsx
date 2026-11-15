import type { Metadata } from "next";
import { asUser } from "@/server/auth";
import { getAcademics } from "@/server/academics";
import { requireProfile } from "@/server/profile";
import { formatPartialDate, todayIn } from "@/lib/dates";
import { formatCredits } from "@/lib/credits";
import { CircleAlert } from "lucide-react";
import { PageHeader } from "@/components/app/ui";
import { AdminDetailsSection, CoursesSection, EnquiriesSection, MilestonesSection, RequirementEditor } from "./academics-client";
import { CreditBar } from "@/components/app/credit-bar";

export const metadata: Metadata = { title: "Academics" };

export default async function AcademicsPage() {
  const data = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    return { profile, today: todayIn(profile.timezone), a: await getAcademics(tx) };
  });
  const { a, profile } = data;
  const c = a.credits?.summary;
  const subtitle = [profile.department, profile.programmeStart ? `programme started ${formatPartialDate(profile.programmeStart, profile.programmeStartPrecision, { short: true })}` : null].filter(Boolean).join(" · ");

  // Counted toward the requirement: recognised, completed (not yet recognised) and enrolled — as on the bar.
  const counted = c ? c.recognised + Math.max(c.completed.known - c.recognised, 0) + c.enrolled.known : 0;
  const missing = a.courses.filter((x) => x.credits === null && x.status !== "dropped");

  return (
    <div className="mx-auto flex max-w-[1080px] flex-col gap-6">
      <PageHeader eyebrow="Academics" title="Coursework and milestones" subtitle={subtitle || undefined} />

      <section data-guide="credits" className="flex flex-col gap-5 rounded-2xl border-2 bg-card p-6 shadow-edge sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <span className="font-display text-xs font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
            {a.requirement?.label ?? "Coursework credits"}{a.requirement?.periodLabel ? ` · ${a.requirement.periodLabel}` : ""}
          </span>
          <RequirementEditor requirement={a.requirement} />
        </div>
        <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
          <div className="flex flex-col gap-1">
            <span className="font-display text-[56px] leading-none font-black tabular-nums">
              {formatCredits(counted)}
              {c?.required != null && <span className="text-[28px] text-zinc-400"> / {formatCredits(c.required)}</span>}
            </span>
            <span className="text-[13px] text-muted-foreground">
              {c?.required != null ? "recognised, completed or enrolled" : "credits so far · no requirement set yet"}
            </span>
          </div>
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3">
            {c ? <CreditBar summary={c} /> : <p className="text-muted-foreground">Add your courses below to see your credits.</p>}
            {c?.incomplete && (
              <p className="flex items-start gap-2.5 rounded-xl bg-attention px-3.5 py-2.5 font-display text-[14px] font-bold text-attention-foreground">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {missing.map((x) => `${x.name}${x.provider ? ` (${x.provider})` : ""}`).join(", ")} {missing.length === 1 ? "has" : "have"} no credit value yet, so {missing.length === 1 ? "it isn't" : "they aren't"} counted. Unknown is never zero.
                </span>
              </p>
            )}
          </div>
        </div>
        <p className="text-[13px] text-muted-foreground">Completed and officially recognised overlap — they&apos;re never added together. Recognition is recorded separately, only when the university confirms it.</p>
      </section>

      <CoursesSection courses={a.courses} items={a.courseItems} today={data.today} />

      <div className="flex flex-wrap items-start gap-6">
        <MilestonesSection milestones={a.milestones} today={data.today} />
        <EnquiriesSection enquiries={a.enquiries} today={data.today} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <AdminDetailsSection details={profile.adminDetails} />
      </div>
    </div>
  );
}
