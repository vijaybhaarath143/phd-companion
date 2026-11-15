import type { Metadata } from "next";
import { asUser } from "@/server/auth";
import { listBenchwork, listPublications } from "@/server/research";
import { reviewProgress } from "@/server/home";
import { requireProfile } from "@/server/profile";
import { PageHeader } from "@/components/app/ui";
import { ResearchTabs } from "./research-tabs";
import { BenchworkView, PublicationsView } from "./research-views";

export const metadata: Metadata = { title: "Research" };

export default async function ResearchPage({ searchParams }: PageProps<"/research">) {
  const sp = await searchParams;
  const view = sp.view === "benchwork" ? "benchwork" : "publications";
  const data = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    if (view === "benchwork") return { profile, publications: [], steps: new Map(), benchwork: await listBenchwork(tx) };
    const rows = await listPublications(tx);
    return { profile, publications: rows, steps: await reviewProgress(tx, rows.map((r) => r.manuscriptId)), benchwork: [] };
  });
  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5">
      <PageHeader eyebrow="Research" title={data.profile.phdTitle ?? "Your research"} subtitle="Your publications and benchwork — all part of the one PhD." />
      <ResearchTabs current={view} />
      {view === "publications" ? <PublicationsView rows={data.publications} steps={data.steps} /> : <BenchworkView rows={data.benchwork} />}
    </div>
  );
}
