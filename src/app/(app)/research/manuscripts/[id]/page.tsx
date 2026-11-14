import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asUser } from "@/server/auth";
import { getManuscriptBundle } from "@/server/research";
import { requireProfile } from "@/server/profile";
import { todayIn } from "@/lib/dates";
import { ManuscriptView } from "./manuscript-view";

export const metadata: Metadata = { title: "Manuscript" };

export default async function ManuscriptPage({ params }: PageProps<"/research/manuscripts/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await asUser(async (tx) => {
    const profile = await requireProfile(tx);
    return { bundle: await getManuscriptBundle(tx, id), today: todayIn(profile.timezone) };
  });
  if (!data.bundle) notFound();
  return <ManuscriptView {...data.bundle} today={data.today} />;
}
