import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

/** An address that doesn't exist (a mistyped or old link). */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-50 p-6">
      <div className="flex w-full max-w-[480px] flex-col gap-4 rounded-xl border bg-card p-8">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">This page doesn&apos;t exist</h1>
        <p className="text-muted-foreground">The link may be mistyped or out of date.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild><Link href="/">Go to Home</Link></Button>
          <Button asChild variant="outline"><Link href="/journal">Open Journal</Link></Button>
        </div>
      </div>
    </div>
  );
}
