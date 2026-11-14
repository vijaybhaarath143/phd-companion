import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asUser } from "@/server/auth";
import { listBenchwork, listProjects, listPublications } from "@/server/research";
import { reviewProgress } from "@/server/home";
import { requireProfile } from "@/server/profile";
import { PageHeader } from "@/components/app/ui";
import { NewProjectForm } from "./new-project-form";
import { ResearchTabs } from "./research-tabs";
import { BenchworkView, PublicationsView } from "./research-views";

export const metadata: Metadata = { title: "Research" };

export default async function ResearchPage({ searchParams }: PageProps<"/research">) {
  const sp = await searchParams;
  const view = sp.view === "publications" || sp.view === "benchwork" ? sp.view : null;
  const data = await asUser(async (tx) => {
    await requireProfile(tx);
    const projects = await listProjects(tx);
    if (view === "publications") {
      const rows = await listPublications(tx);
      return { projects, publications: rows, steps: await reviewProgress(tx, rows.flatMap((r) => (r.projectId ? [r.projectId] : []))), benchwork: [] };
    }
    if (view === "benchwork") return { projects, publications: [], steps: new Map(), benchwork: await listBenchwork(tx) };
    return { projects, publications: [], steps: new Map(), benchwork: [] };
  });
  const last = (await cookies()).get("last_project")?.value;
  const projectHref = data.projects.length ? `/research/projects/${data.projects.find((p) => p.id === last)?.id ?? data.projects[0].id}` : "/research?new=1";

  if (view) {
    return (
      <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
        <PageHeader title="Research" subtitle="Your projects, publications and benchwork." />
        <ResearchTabs current={view} projectHref={projectHref} />
        {view === "publications" ? <PublicationsView rows={data.publications} steps={data.steps} /> : <BenchworkView rows={data.benchwork} />}
      </div>
    );
  }

  // the project she last looked at on this device (set by the project page), else the first
  if (data.projects.length && sp.new !== "1") redirect(projectHref);
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <PageHeader title="New project" subtitle="A project groups related entries, tasks, manuscripts and experiments. A title is all it needs." />
      <NewProjectForm />
    </div>
  );
}
