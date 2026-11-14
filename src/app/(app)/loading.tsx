import { Skeleton } from "@/components/ui/skeleton";

/** Shown while a screen loads (the sidebar stays put). */
export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1000px] flex-col gap-5" aria-busy="true">
      <span role="status" className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-56" />
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[3_1_420px] flex-col gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <div className="flex min-w-0 flex-[2_1_280px] flex-col gap-4">
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
