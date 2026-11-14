import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { asUser } from "@/server/auth";
import { getEntry } from "@/server/journal";
import { projectOptions, requireProfile } from "@/server/profile";
import { todayIn } from "@/lib/dates";
import { EntryEditor } from "./entry-editor";

export const metadata: Metadata = { title: "Entry" };

export default async function EntryPage({ params }: PageProps<"/journal/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    const entry = await getEntry(tx, id);
    return { entry, projects: await projectOptions(tx), today: todayIn(profile.timezone) };
  });
  if (!data.entry) notFound();
  if (data.entry.hasExperiment) redirect(`/research/experiments/${id}`);
  return <EntryEditor key={id} entry={data.entry} projects={data.projects} today={data.today} />;
}
