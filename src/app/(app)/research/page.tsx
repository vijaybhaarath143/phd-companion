import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { asUser } from "@/server/auth";
import { listProjects } from "@/server/research";
import { requireProfile } from "@/server/profile";
import { PageHeader } from "@/components/app/ui";
import { NewProjectForm } from "./new-project-form";

export const metadata: Metadata = { title: "Research" };

export default async function ResearchPage({ searchParams }: PageProps<"/research">) {
  const sp = await searchParams;
  const projects = await asUser(async (tx) => {
    await requireProfile(tx);
    return listProjects(tx);
  });
  if (projects.length && sp.new !== "1") redirect(`/research/projects/${projects[0].id}`);
  return (
    <div className="mx-auto flex max-w-[640px] flex-col gap-6">
      <PageHeader title="New project" subtitle="A project groups related entries, tasks, manuscripts and experiments. A title is all it needs." />
      <NewProjectForm />
    </div>
  );
}
