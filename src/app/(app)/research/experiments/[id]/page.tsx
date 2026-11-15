import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asUser } from "@/server/auth";
import { getExperimentBundle, getTrials } from "@/server/research";
import { Trials } from "./trials";
import { requireProfile } from "@/server/profile";
import { formatTimestamp, todayIn } from "@/lib/dates";
import { isUuid } from "@/lib/utils";
import { ExperimentEditor } from "./experiment-editor";

export const metadata: Metadata = { title: "Experiment" };

export default async function ExperimentPage({ params, searchParams }: PageProps<"/research/experiments/[id]">) {
  const { id } = await params;
  const openDate = (await searchParams).date === "1";
  if (!isUuid(id)) notFound();
  const data = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    return { bundle: await getExperimentBundle(tx, id), trials: await getTrials(tx, id), today: todayIn(profile.timezone), tz: profile.timezone };
  });
  if (!data.bundle) notFound();
  const { revisions, ...bundle } = data.bundle;
  return (
    <ExperimentEditor
      key={id}
      {...bundle}
      // times are shown on her own clock, formatted here so the page reads the same before and after it loads
      revisions={revisions.map((r) => ({ ...r, capturedLabel: formatTimestamp(r.capturedAt, data.tz, { time: true }) }))}
      today={data.today}
      openDate={openDate}
      trials={<Trials entryId={id} trials={data.trials} />}
    />
  );
}
