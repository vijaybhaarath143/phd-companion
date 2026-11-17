import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { ArrowLeft, Eye } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { IconTile } from "@/components/app/ui";
import { SprigDock } from "@/components/app/sprig-dock";

export const VIEWS = {
  overview: "Overview",
  planner: "Planner",
  research: "Research",
  academics: "Academics",
  events: "Events",
  journal: "Journal",
  notes: "Notes",
} as const;
export type View = keyof typeof VIEWS;

/** The page around a scholar's work as an admin sees it: whose it is, that it's read-only, and the tabs. */
export function ScholarFrame({ id, name, current, back, children }: { id: string; name: string; current?: View; back?: { href: string; label: string }; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b-2 bg-card px-4 py-3 sm:px-6">
        <Brand href="/admin" size="sm" />
        <Link href={back?.href ?? "/admin"} className="flex items-center gap-1.5 font-display text-sm font-extrabold text-sky hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {back?.label ?? "All scholars"}
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-[880px] flex-col gap-5 px-4 pt-6 pb-36 sm:px-6 md:pt-8">
        <div role="status" className="flex items-start gap-3 rounded-2xl border-2 border-sky-soft bg-sky-soft/50 px-4 py-3 text-[14px]">
          <IconTile tone="sky" size="sm"><Eye /></IconTile>
          <p>
            <span className="font-display font-extrabold">You&apos;re looking at {name}&apos;s work, read-only.</span> Nothing can be changed from here. They can see in Settings that you looked, and it&apos;s in the activity log.
          </p>
        </div>
        {current && (
          <nav aria-label="Areas" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {(Object.keys(VIEWS) as View[]).map((v) => (
              <Link
                key={v}
                href={v === "overview" ? `/admin/scholars/${id}` : `/admin/scholars/${id}?view=${v}`}
                aria-current={v === current ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full border-2 px-3.5 py-1.5 font-display text-[14px] font-bold transition-colors",
                  v === current ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
                )}
              >
                {VIEWS[v]}
              </Link>
            ))}
          </nav>
        )}
        {children}
      </main>
      <SprigDock />
    </div>
  );
}

/** A record's text, kept as written (line breaks included). */
export function Text({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-display text-xs font-extrabold tracking-[0.06em] text-muted-foreground uppercase">{label}</span>
      <p className="text-[15px] whitespace-pre-wrap break-words">{children}</p>
    </div>
  );
}
