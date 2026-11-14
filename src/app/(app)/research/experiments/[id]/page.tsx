import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asUser } from "@/server/auth";
import { getExperimentBundle } from "@/server/research";
import { requireProfile } from "@/server/profile";
import { todayIn } from "@/lib/dates";
import { ExperimentEditor } from "./experiment-editor";

export const metadata: Metadata = { title: "Experiment" };

export default async function ExperimentPage({ params }: PageProps<"/research/experiments/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    return { bundle: await getExperimentBundle(tx, id), today: todayIn(profile.timezone) };
  });
  if (!data.bundle) notFound();
  return <ExperimentEditor key={id} {...data.bundle} today={data.today} />;
}
