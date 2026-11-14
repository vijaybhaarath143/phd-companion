import Link from "next/link";
import { redirect } from "next/navigation";
import { asUser } from "@/server/auth";
import { getProfile, projectOptions } from "@/server/profile";
import { todayIn } from "@/lib/dates";
import { QuickAddProvider } from "@/components/app/quick-add";
import { MobileNav, Sidebar } from "@/components/app/nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { profile, projects, overdue } = await asUser(async (tx) => {
    const profile = await getProfile(tx);
    const projects = await projectOptions(tx);
    const tz = profile?.timezone ?? "Asia/Kolkata";
    const [{ overdue }] = await tx<{ overdue: number }[]>`
      select count(*)::int as overdue from public.tasks
      where deleted_at is null and status not in ('done','cancelled') and due_date < ${todayIn(tz)}`;
    return { profile, projects, overdue };
  });
  if (!profile?.onboardedAt) redirect("/welcome");
  const today = todayIn(profile.timezone);

  return (
    <QuickAddProvider projects={projects} today={today}>
      <div className="flex min-h-dvh">
        <Sidebar name={profile.displayName ?? ""} department={profile.department} />
        <div className="flex min-w-0 flex-1 flex-col">
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
    </QuickAddProvider>
  );
}
