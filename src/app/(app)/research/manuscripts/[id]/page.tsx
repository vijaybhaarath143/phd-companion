import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asUser } from "@/server/auth";
import { getManuscriptBundle } from "@/server/research";
import { requireProfile } from "@/server/profile";
import { formatTimestamp, todayIn } from "@/lib/dates";
import { isUuid } from "@/lib/utils";
import { ManuscriptView } from "./manuscript-view";

export const metadata: Metadata = { title: "Manuscript" };

export default async function ManuscriptPage({ params }: PageProps<"/research/manuscripts/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    return { bundle: await getManuscriptBundle(tx, id), today: todayIn(profile.timezone), tz: profile.timezone };
  });
  if (!data.bundle) notFound();
  const { history, submissionHistory, ...bundle } = data.bundle;
  // "recorded on" dates are shown on her own clock, formatted here so the page reads the same before and after it loads
  return (
    <ManuscriptView
      {...bundle}
      history={history.map((h) => ({ ...h, recordedLabel: formatTimestamp(h.recordedAt, data.tz) }))}
      submissionHistory={submissionHistory.map((s) => ({ ...s, recordedLabel: formatTimestamp(s.recordedAt, data.tz, { time: true }) }))}
      today={data.today}
    />
  );
}
