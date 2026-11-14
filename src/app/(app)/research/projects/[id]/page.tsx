import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { cn } from "cn";
import { asUser } from "@/server/auth";
import { getProjectBundle, listProjects } from "@/server/research";
import { requireProfile } from "@/server/profile";
import { formatPartialDate } from "@/lib/dates";
import { categories, experimentStatuses, phases, projectStatuses, projectTypes } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Empty, Rows, RowLink, Section } from "@/components/app/ui";
import { QuickAddButton } from "@/components/app/quick-add";
import { ProjectActions } from "./project-actions";
import { Evidence } from "@/components/app/evidence";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({ params }: PageProps<"/research/projects/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await asUser(async (tx) => {
    await requireProfile(tx);
    return { bundle: await getProjectBundle(tx, id), projects: await listProjects(tx) };
  });
  if (!data.bundle) notFound();
  const { project, manuscripts, experiments, tasks, entries, evidence } = data.bundle;

  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
      <nav aria-label="Projects" data-guide="projects" className="flex flex-wrap gap-2">
        {data.projects.map((p) => (
          <Link
            key={p.id}
            href={`/research/projects/${p.id}`}
            aria-current={p.id === id ? "page" : undefined}
            className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium", p.id === id ? "border-primary bg-primary text-primary-foreground" : "bg-background text-zinc-700 hover:bg-muted")}
          >
            {p.title.split(":")[0]}
          </Link>
        ))}
        <Link href="/research?new=1" className="inline-flex h-9 items-center gap-1 rounded-full border border-dashed px-3.5 text-[13px] font-medium text-zinc-700 hover:bg-muted">
          <Plus className="size-3.5" aria-hidden /> New project
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
          <h1 className="text-2xl leading-8 font-semibold tracking-[-0.015em] text-balance">{project.title}</h1>
          <div className="flex flex-wrap gap-2">
            {project.type && <Badge variant="outline">{projectTypes[project.type as keyof typeof projectTypes]}</Badge>}
            <Badge variant="outline">{projectStatuses[project.status as keyof typeof projectStatuses]}</Badge>
          </div>
        </div>
        <QuickAddButton projectId={project.id} label="Add entry to this project" />
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-4">
          <Section guide="manuscripts" title="Manuscripts" action={<ProjectActions kind="manuscript" projectId={project.id} />}>
            {manuscripts.length ? (
              <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
                {manuscripts.map((m) => (
                  <li key={m.id}>
                    <Link href={`/research/manuscripts/${m.id}`} className="flex min-h-14 items-center gap-3 px-5 py-3 hover:bg-zinc-50">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{m.title}</span>
                        <span className="block text-[13px] text-zinc-600">Phase: {phases[m.currentPhase]}</span>
                      </span>
                      {m.openFeedback > 0 && <Badge variant="attention">Feedback to address</Badge>}
                      {m.openFeedback === 0 && m.waiting > 0 && <Badge variant="attention">Guide feedback pending</Badge>}
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No manuscript yet.</Empty>
            )}
          </Section>

          <Section guide="project-tasks" title="Open tasks" action={<Link href="/planner" className="text-[13px] hover:underline">All tasks</Link>}>
            {tasks.length ? (
              <ProjectActions kind="tasks" projectId={project.id} tasks={tasks} />
            ) : (
              <>
                <Empty>No open tasks.</Empty>
                <ProjectActions kind="tasks" projectId={project.id} tasks={[]} />
              </>
            )}
          </Section>

          <Section guide="experiments" title="Experiments" action={<ProjectActions kind="experiment" projectId={project.id} />}>
            {experiments.length ? (
              <Rows>
                {experiments.map((x) => (
                  <RowLink key={x.id} href={`/research/experiments/${x.id}`} title={x.title}
                    detail={formatPartialDate(x.entryDate, x.entryPrecision)}
                    badge={x.status ? experimentStatuses[x.status as keyof typeof experimentStatuses] : "Status not set"} />
                ))}
              </Rows>
            ) : (
              <Empty>No experiments in this project.</Empty>
            )}
          </Section>

          <Section title="Recent entries" action={<Link href={`/journal?project=${project.id}`} className="text-[13px] hover:underline">All entries</Link>}>
            {entries.length ? (
              <Rows>
                {entries.map((e) => (
                  <RowLink key={e.id} href={`/journal/${e.id}`} title={e.title}
                    detail={[formatPartialDate(e.entryDate, e.entryPrecision), e.category ? categories[e.category as keyof typeof categories] : null].filter(Boolean).join(" · ")} />
                ))}
              </Rows>
            ) : (
              <Empty>Nothing recorded for this project yet.</Empty>
            )}
          </Section>
        </div>

        <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-4">
          <ProjectActions kind="about" projectId={project.id} project={project} />
          <section data-guide="evidence" className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-4">
            <h2 className="text-[15px] font-semibold">Evidence</h2>
            <Evidence items={evidence} parentType="project" parentId={project.id} hint="Drafts, figures, or a link to a shared folder." />
          </section>
        </div>
      </div>
    </div>
  );
}
