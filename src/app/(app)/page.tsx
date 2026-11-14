import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { asUser } from "@/server/auth";
import { requireProfile } from "@/server/profile";
import { getHome } from "@/server/home";
import { greeting, longToday, todayIn } from "@/lib/dates";
import { describeBucket, formatCredits } from "@/lib/credits";
import { Empty, PageHeader, RowLink, Rows, Section } from "@/components/app/ui";
import { QuickAddButton } from "@/components/app/quick-add";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const { profile, home } = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    return { profile, home: await getHome(tx, todayIn(profile.timezone)) };
  });
  const tz = profile.timezone;
  const name = profile.displayName?.split(" ")[0];

  if (home.isEmpty) {
    return (
      <div className="mx-auto flex max-w-[960px] flex-col gap-6">
        <PageHeader eyebrow={longToday(tz)} title={name ? `Welcome, ${name}` : "Welcome"} />
        <section className="flex flex-col items-center gap-4 rounded-xl border bg-card px-8 py-10 text-center">
          <div aria-hidden className="flex size-11 items-center justify-center rounded-full bg-muted">
            <BookOpen className="size-5 text-zinc-700" />
          </div>
          <div className="flex max-w-[460px] flex-col gap-1.5">
            <h2 className="text-lg font-semibold">Record your first entry</h2>
            <p className="text-muted-foreground">Anything that happened — a meeting, a reading, an experiment, a deadline. A title and a date are enough.</p>
          </div>
          <QuickAddButton label="Quick Add" variant="default" />
        </section>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          <Section title="Your projects" action={<Link href="/research" className="text-[13px] hover:underline">Open Research</Link>}>
            {home.workingOn.length ? (
              <Rows>{home.workingOn.map((p) => <RowLink key={p.id} href={p.href} title={p.title} detail="No entries yet" />)}</Rows>
            ) : (
              <Empty>No projects yet.</Empty>
            )}
          </Section>
          <Section title="Requirements" padded>
            <p className="text-muted-foreground">Not set up yet. Add your credit requirement and milestones whenever you&apos;re ready.</p>
            <Button asChild variant="outline" className="mt-4"><Link href="/academics">Set up requirements</Link></Button>
          </Section>
        </div>
      </div>
    );
  }

  const c = home.credits?.summary;
  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-6">
      <PageHeader eyebrow={longToday(tz)} title={greeting(tz)} />
      <Link href="/journal?search=1" className="flex h-11 items-center gap-2 rounded-lg border bg-background px-3 text-muted-foreground md:hidden">
        <Search className="size-4" aria-hidden /> Search everything
      </Link>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-4">
          <Section title="Needs attention" action={home.attentionTotal > 0 && <span className="text-[13px] text-muted-foreground">{home.attentionTotal} {home.attentionTotal === 1 ? "item" : "items"}</span>}>
            {home.attention.length ? (
              <Rows>{home.attention.map((a, i) => <RowLink key={i} href={a.href} title={a.title} detail={a.detail} badge={a.badge} attention={a.attention} />)}</Rows>
            ) : (
              <Empty>Nothing needs you right now.</Empty>
            )}
          </Section>

          <Section title="Working on" action={<Link href="/research" className="text-[13px] hover:underline">All projects</Link>}>
            {home.workingOn.length ? (
              <Rows>{home.workingOn.map((p) => <RowLink key={p.id} href={p.href} title={p.title} detail={p.detail} />)}</Rows>
            ) : (
              <Empty>No active projects. <Link href="/research" className="underline">Add one</Link>.</Empty>
            )}
          </Section>

          <Section title="Recently recorded" action={<Link href="/journal" className="text-[13px] hover:underline">Open Journal</Link>}>
            <Rows>{home.recent.map((e) => <RowLink key={e.id} href={e.href} title={e.title} detail={e.detail} />)}</Rows>
          </Section>
        </div>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-4">
          <Section padded title={home.credits?.label ?? "Coursework credits"} action={home.credits?.period && <span className="text-[13px] text-muted-foreground">{home.credits.period}</span>}>
            {c ? (
              <>
                <dl className="text-sm">
                  {[
                    ["Required", c.required === null ? { value: "Not set", note: null } : { value: formatCredits(c.required), note: null }],
                    ["Enrolled", describeBucket(c.enrolled)],
                    ["Completed", describeBucket(c.completed)],
                    ["Officially recognised", { value: formatCredits(c.recognised), note: null }],
                  ].map(([label, v]) => {
                    const val = v as { value: string; note: string | null };
                    return (
                      <div key={label as string} className="flex items-baseline justify-between gap-3 border-t border-zinc-100 py-2.5 first:border-t-0">
                        <dt>{label as string}</dt>
                        <dd className="text-right">
                          {val.note && val.value === "—" ? <span className="text-muted-foreground">{val.note}</span> : <span className="font-semibold tabular-nums">{val.value}</span>}
                          {val.note && val.value !== "—" && <span className="block text-[12px] text-muted-foreground">{val.note}</span>}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
                {c.incomplete && <p className="mt-2 text-[13px] text-muted-foreground">Totals are incomplete until every course has a credit value.</p>}
              </>
            ) : (
              <p className="text-muted-foreground">Not set up yet.</p>
            )}
            <Link href="/academics" className="mt-3 inline-block text-[13px] underline-offset-4 hover:underline">Open Academics</Link>
          </Section>

          <Section title="Coming up" action={<Link href="/planner" className="text-[13px] hover:underline">Planner</Link>}>
            {home.comingUp.length ? (
              <Rows>{home.comingUp.map((u) => <RowLink key={u.id} href={u.href} title={u.title} detail={u.detail} badge={u.badge} />)}</Rows>
            ) : (
              <Empty>Nothing dated yet.</Empty>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
