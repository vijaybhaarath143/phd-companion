import type { Metadata } from "next";
import { asUser } from "@/server/auth";
import { getAcademics } from "@/server/academics";
import { projectOptions, requireProfile } from "@/server/profile";
import { formatPartialDate, todayIn } from "@/lib/dates";
import { describeBucket, formatCredits } from "@/lib/credits";
import { PageHeader } from "@/components/app/ui";
import { AdminDetailsSection, CoursesSection, EnquiriesSection, MilestonesSection, RequirementEditor } from "./academics-client";
import { CreditBar } from "@/components/app/credit-bar";

export const metadata: Metadata = { title: "Academics" };

export default async function AcademicsPage() {
  const data = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    return { profile, today: todayIn(profile.timezone), a: await getAcademics(tx), projects: await projectOptions(tx) };
  });
  const { a, profile } = data;
  const c = a.credits?.summary;
  const subtitle = [profile.department, profile.programmeStart ? `programme started ${formatPartialDate(profile.programmeStart, profile.programmeStartPrecision, { short: true })}` : null].filter(Boolean).join(" · ");

  const stat = (value: string, label: string, note?: string | null) => (
    <div className="rounded-[10px] border border-zinc-100 bg-zinc-50 p-4">
      <div className={`text-2xl font-semibold tracking-[-0.015em] tabular-nums ${value === "—" ? "text-muted-foreground" : ""}`}>{value}</div>
      <div className="text-[13px] text-zinc-600">{label}{note ? ` · ${note}` : ""}</div>
    </div>
  );

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
      <PageHeader title="Academics" subtitle={subtitle || undefined} />

      <section data-guide="credits" className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div>
            <h2 className="text-[15px] font-semibold">{a.requirement?.label ?? "Coursework credits"}{a.requirement?.periodLabel ? ` — ${a.requirement.periodLabel.toLowerCase()}` : ""}</h2>
            <p className="text-[13px] text-muted-foreground">Your requirement, set by you. Edit it if your department&apos;s rules change.</p>
          </div>
          <RequirementEditor requirement={a.requirement} />
        </div>
        <div className="flex flex-col gap-3 px-5 pb-5">
          {c && <CreditBar summary={c} />}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            {stat(c?.required != null ? formatCredits(c.required) : "—", "Required", c?.required == null ? "not set" : null)}
            {(() => { const b = c ? describeBucket(c.planned) : { value: "0", note: null }; return stat(b.value, "Planned", b.note); })()}
            {(() => { const b = c ? describeBucket(c.enrolled) : { value: "0", note: null }; return stat(b.value, "Enrolled", b.note); })()}
            {(() => { const b = c ? describeBucket(c.completed) : { value: "0", note: null }; return stat(b.value, "Completed", b.note); })()}
            {stat(c ? formatCredits(c.recognised) : "0", "Officially recognised")}
          </div>
          {c?.incomplete && (
            <p className="rounded-lg border border-attention-border bg-attention px-3 py-2.5 text-[13px] text-attention-foreground">
              Totals are incomplete: {a.courses.filter((x) => x.credits === null && x.status !== "dropped").map((x) => `${x.name}${x.provider ? ` (${x.provider})` : ""}`).join(", ")} {a.courses.filter((x) => x.credits === null && x.status !== "dropped").length === 1 ? "has" : "have"} no credit value yet. Unknown is never counted as zero.
            </p>
          )}
          <p className="text-[13px] text-muted-foreground">Completed and officially recognised overlap — they&apos;re never added together. Recognition is recorded separately, only when the university confirms it.</p>
        </div>
      </section>

      <CoursesSection courses={a.courses} items={a.courseItems} today={data.today} />

      <div className="flex flex-wrap items-start gap-4">
        <MilestonesSection milestones={a.milestones} projects={data.projects} today={data.today} />
        <EnquiriesSection enquiries={a.enquiries} today={data.today} />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <AdminDetailsSection details={profile.adminDetails} />
      </div>
    </div>
  );
}
