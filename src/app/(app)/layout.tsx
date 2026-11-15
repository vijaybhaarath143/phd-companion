import Link from "next/link";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { asUser, requireUser } from "@/server/auth";
import { removeQueuedFiles, storageAsUser } from "@/server/storage";
import { getProfile, publicationOptions } from "@/server/profile";
import { todayIn } from "@/lib/dates";
import { QuickAddProvider } from "@/components/app/quick-add";
import { MobileNav, Sidebar } from "@/components/app/nav";
import { GuideProvider } from "@/components/app/guide";
import { KeepReminding } from "@/components/app/keep-reminding";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile, publications, overdue, nagging } = await asUser(async (tx) => {
    const profile = await getProfile(tx);
    const publications = await publicationOptions(tx);
    const tz = profile?.timezone ?? "Asia/Kolkata";
    const [{ overdue }] = await tx<{ overdue: number }[]>`
      select count(*)::int as overdue from public.tasks
      where deleted_at is null and status not in ('done','cancelled') and due_date < ${todayIn(tz)}`;
    // tasks she asked to be reminded about until they're done, most urgent first
    const nagging = await tx<{ id: string; title: string; total: number }[]>`
      select id, title, count(*) over ()::int as total from public.tasks
      where remind_until_done and deleted_at is null and status not in ('done','cancelled')
      order by due_date nulls last, case priority when 'high' then 0 when 'normal' then 1 else 2 end, created_at
      limit 1`;
    return { profile, publications, overdue, nagging };
  });
  if (!profile?.onboardedAt) redirect("/welcome");

  // In the background, after the page is sent: remove stored files that are no longer
  // evidence (failed uploads, files of records purged from Trash).
  const [user, bucket] = await Promise.all([requireUser(), storageAsUser()]);
  if (bucket) after(() => removeQueuedFiles(user, bucket));
  const today = todayIn(profile.timezone);

  return (
    <QuickAddProvider publications={publications} today={today}>
      <GuideProvider>
        <div className="flex min-h-dvh">
          <Sidebar name={profile.displayName ?? ""} department={profile.department} phdTitle={profile.phdTitle} />
          <div className="flex min-w-0 flex-1 flex-col">
            {nagging.length > 0 && <KeepReminding tasks={nagging} />}
            {profile.remindersEnabled && overdue > 0 && (
              <div role="status" className="border-b border-attention-border bg-attention px-5 py-2 text-center text-[13px] text-attention-foreground md:px-10">
                {overdue === 1 ? "1 task is overdue." : `${overdue} tasks are overdue.`}{" "}
                <Link href="/planner" className="font-medium underline underline-offset-2">Open Planner</Link>
              </div>
            )}
            <main className="w-full flex-1 px-4 pt-6 pb-28 sm:px-6 md:px-10 md:pt-8 md:pb-12">{children}</main>
          </div>
        </div>
        <MobileNav />
      </GuideProvider>
    </QuickAddProvider>
  );
}
