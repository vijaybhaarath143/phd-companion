"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { quickAction } from "@/components/app/call-action";
import { toggleTask } from "@/server/actions/tasks";
import { cueSprig } from "@/components/app/sprig-bus";

/**
 * The reminder for tasks marked "Keep reminding me until it's done": on every page, until the
 * task is ticked off (here or anywhere else). Shows the most urgent one and how many more.
 */
export function KeepReminding({ tasks }: { tasks: { id: string; title: string; total: number }[] }) {
  const [pending, start] = useTransition();
  const [first] = tasks;
  const more = first.total - 1;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-attention-border bg-attention px-5 py-2 text-[13px] text-attention-foreground md:px-10">
      <Bell className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-[1_1_240px]">
        <span className="font-semibold">{first.title}</span> — you asked to be reminded until it&apos;s done.
        {more > 0 && <span> {more === 1 ? "1 more task" : `${more} more tasks`} too.</span>}
      </span>
      <span className="flex gap-2">
        <Button asChild size="sm" variant="outline" className="h-7 border-attention-border bg-transparent text-attention-foreground hover:bg-white/60">
          <Link href="/planner">Open Planner</Link>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          className="h-7 border-attention-border bg-white text-attention-foreground hover:bg-white/80"
          onClick={() => start(async () => { if (await quickAction(() => toggleTask(first.id, true))) { toast.success("Marked done"); cueSprig({ kind: "done" }); } })}
        >
          Mark done
        </Button>
      </span>
    </div>
  );
}
