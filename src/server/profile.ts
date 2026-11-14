import "server-only";
import { redirect } from "next/navigation";
import type { Tx } from "@/server/db";
import type { Precision } from "@/lib/dates";

export type Profile = {
  userId: string;
  displayName: string | null;
  university: string | null;
  department: string | null;
  guideName: string | null;
  programmeStart: string | null;
  programmeStartPrecision: Precision;
  timezone: string;
  remindersEnabled: boolean;
  onboardedAt: Date | null;
  version: number;
};

export async function getProfile(tx: Tx): Promise<Profile | null> {
  const [p] = await tx<Profile[]>`select * from public.profiles where user_id = auth.uid()`;
  return p ?? null;
}

export async function ensureProfile(tx: Tx): Promise<Profile> {
  await tx`insert into public.profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing`;
  return (await getProfile(tx))!;
}

export type ProjectOption = { id: string; title: string };

export async function projectOptions(tx: Tx): Promise<ProjectOption[]> {
  return tx<ProjectOption[]>`
    select id, title from public.projects
    where deleted_at is null and archived_at is null
    order by created_at`;
}

/** For pages inside the app: the profile, or a redirect to onboarding if it isn't finished. */
export async function requireProfile(tx: Tx): Promise<Profile> {
  const p = await getProfile(tx);
  if (!p?.onboardedAt) redirect("/welcome");
  return p;
}
