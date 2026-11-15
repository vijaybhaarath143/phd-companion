"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { LiveSprig } from "@/components/app/sprig-live";

/** Something went wrong inside a page: keep the sidebar, explain plainly, offer a way on. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = error instanceof Error && "digest" in error ? String((error as { digest?: string }).digest ?? "") : "";

  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-4 rounded-2xl border-2 bg-card shadow-edge p-6">
      <LiveSprig mood="oops" className="w-20" />
      <h1 className="text-2xl font-black">This page couldn&apos;t load</h1>
      <p className="text-muted-foreground">
        Usually the connection dropped or the app was just updated. Nothing you saved is lost. Try again — if it keeps happening, reload the page.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>Reload the page</Button>
        <Button asChild variant="ghost"><Link href="/">Go to Home</Link></Button>
      </div>
      {digest && <p className="text-[12px] text-muted-foreground">Reference: {digest}</p>}
    </div>
  );
}
